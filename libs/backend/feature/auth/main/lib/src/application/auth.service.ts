import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthProvider,
  AuthProviderChannel,
  normalizeUserThemePreference,
  permissionsForRoles,
  resolveBootstrapRoleKeys,
  toAuthenticatedUserView,
  type AuthSessionView,
  type AuthMethodClaims,
  type AuthenticatedUserView,
  type UserThemePreference,
} from '@app/backend-feature-auth-shared';
import { normalizeLocale } from '@app/backend-common-i18n';
import {
  AuthUserStoreInjectToken,
  type AuthUserRecord,
  type AuthUserStore,
  AuthTokenStoreInjectToken,
  type AuthTokenStore,
  type AuthUserTokenPurpose,
  type UserActionTokenRecord,
  InMemoryAuthTokenStore,
  SocialAuthStoreInjectToken,
  type SocialAuthStore,
} from '../infrastructure';
import { createAuthSession } from './auth-session.factory';
import { EffectivePermissionService } from './effective-permission.service';
import { AuthNotificationPublisher } from './auth-notification.publisher';
import { normalizeEmail, hashPassword, verifyPassword } from '../domain';
import type {
  LoginInput,
  PasswordResetConfirmInput,
  RegisterUserInput,
  UserActionTokenConfirmInput,
  UserActionTokenInput,
} from './type/auth-service.type';
import { parseTenantId } from './util/auth-error-adapter.util';

// Input DTOs and tenant exception-translation helpers were decomposed
// into role-based sibling files; they are re-exported here so the application
// barrel stays stable.
export * from './type/auth-service.type';
export * from './util/auth-error-adapter.util';

// Authentication metadata for a fresh password session. `auth_time` records the
// real login event and is preserved for step-up decisions during this session.
function passwordAuthClaims(): AuthMethodClaims {
  return {
    amr: ['pwd'],
    authProvider: AuthProvider.Password,
    authChannel: AuthProviderChannel.Password,
    authTime: Math.floor(Date.now() / 1000),
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthUserStoreInjectToken)
    private readonly users: AuthUserStore,
    @Optional()
    @Inject(AuthTokenStoreInjectToken)
    private readonly tokens: AuthTokenStore = new InMemoryAuthTokenStore(),
    @Optional()
    @Inject(SocialAuthStoreInjectToken)
    private readonly social?: SocialAuthStore,
    @Optional()
    private readonly effectivePermissions?: EffectivePermissionService,
    @Optional()
    private readonly authNotifications?: AuthNotificationPublisher,
  ) {}

  async register(input: RegisterUserInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const email = normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email, tenantId);
    if (existing.isErr()) {
      throw new ConflictException(existing.error.message);
    }
    if (existing.value) {
      throw new ConflictException('Email is already registered for tenant.');
    }

    // Assign bootstrap roles through the normalized RBAC store. The in-memory
    // implementation receives the same matrix-derived projection so unit tests
    // and non-Postgres adapters expose the same session view.
    const roleKeys = resolveBootstrapRoleKeys(email, process.env, tenantId);
    const created = await this.users.create({
      tenantId,
      email,
      displayName: input.displayName?.trim() || null,
      passwordHash: hashPassword(input.password),
      locale: normalizeLocale(input.locale),
      theme: normalizeUserThemePreference(input.theme),
      roles: roleKeys,
      permissions: permissionsForRoles(roleKeys),
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }
    const sessionUser = await this.bootstrapUserAccess(created.value, roleKeys);
    await this.recordPasswordMethod(sessionUser);

    const claims = passwordAuthClaims();
    return this.createSession(sessionUser, claims);
  }

  // Assign bootstrap roles to a freshly created user and return its effective
  // access projection. When no resolver is wired, the in-memory record already
  // carries the matrix-derived session view.
  async bootstrapUserAccess(user: AuthUserRecord, roleKeys: readonly string[]): Promise<AuthUserRecord> {
    if (!this.effectivePermissions) {
      return user;
    }

    const refreshed = await this.effectivePermissions.assignRolesAndRefresh({
      userId: user.id,
      tenantId: user.tenantId,
      roleKeys,
    });

    return refreshed ?? user;
  }

  async login(input: LoginInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email, tenantId);
    if (user.isErr() || !user.value || !verifyPassword(input.password, user.value.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.value.status !== 'active') {
      throw new UnauthorizedException('User is not active.');
    }

    const loggedIn = await this.users.recordLogin(user.value.id, new Date(), tenantId);
    const sessionUser = loggedIn.isOk() && loggedIn.value ? loggedIn.value : user.value;
    await this.recordPasswordMethod(sessionUser);
    const claims = passwordAuthClaims();
    return this.createSession(sessionUser, claims);
  }

  async issueEmailVerificationToken(input: UserActionTokenInput): Promise<string | null> {
    return this.issueUserActionToken(input, 'email_verification');
  }

  async issuePasswordResetToken(input: UserActionTokenInput): Promise<string | null> {
    return this.issueUserActionToken(input, 'password_reset');
  }

  async consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string | null,
  ): Promise<boolean> {
    const consumed = await this.tokens.consumeUserActionToken(token, purpose, parseTenantId(tenantId));
    return consumed.isOk() && Boolean(consumed.value);
  }

  async confirmEmailVerification(input: UserActionTokenConfirmInput): Promise<AuthenticatedUserView> {
    const consumed = await this.redeemUserActionToken(input, 'email_verification');
    return this.requireRecoveredUser(await this.users.verifyEmail(consumed.userId, consumed.tenantId, new Date()));
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput): Promise<AuthenticatedUserView> {
    const consumed = await this.redeemUserActionToken(input, 'password_reset');
    return this.requireRecoveredUser(
      await this.users.replacePassword(consumed.userId, hashPassword(input.password), consumed.tenantId),
    );
  }

  async getUserById(id: string, tenantId?: string | null): Promise<AuthenticatedUserView | null> {
    const resolvedTenantId = parseTenantId(tenantId);
    const user = await this.users.findById(id, resolvedTenantId);
    if (user.isErr() || !user.value) {
      return null;
    }

    return toAuthenticatedUserView(user.value);
  }

  async updateUserLocale(
    id: string,
    tenantIdOrLocale: string | null | undefined,
    maybeInputLocale?: string | null,
  ): Promise<AuthenticatedUserView> {
    const hasExplicitTenant = arguments.length >= 3;
    const tenantId = hasExplicitTenant ? tenantIdOrLocale : undefined;
    const inputLocale = hasExplicitTenant ? maybeInputLocale : tenantIdOrLocale;
    return this.updateUserPreferences(id, tenantId, { locale: inputLocale });
  }

  async updateUserPreferences(
    id: string,
    tenantIdOrInput:
      | string
      | {
          locale?: string | null;
          theme?: string | null;
        }
      | null
      | undefined,
    maybeInput?: {
      locale?: string | null;
      theme?: string | null;
    } | null,
  ): Promise<AuthenticatedUserView> {
    const hasExplicitTenant = typeof tenantIdOrInput === 'string' || arguments.length >= 3;
    const tenantIdInput =
      hasExplicitTenant &&
      (typeof tenantIdOrInput === 'string' || tenantIdOrInput === null || tenantIdOrInput === undefined)
        ? tenantIdOrInput
        : undefined;
    const resolvedTenantId = parseTenantId(tenantIdInput);
    const input = hasExplicitTenant ? maybeInput : tenantIdOrInput;
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Preferences payload must be an object.');
    }

    const preferences: { locale?: ReturnType<typeof normalizeLocale> } & {
      theme?: UserThemePreference;
    } = {};

    if (input.locale !== undefined) {
      const locale = normalizeLocale(input.locale);
      if (!locale) {
        throw new BadRequestException('Unsupported locale.');
      }
      preferences.locale = locale;
    }

    if (input.theme !== undefined) {
      const theme = normalizeUserThemePreference(input.theme);
      if (!theme) {
        throw new BadRequestException('Unsupported theme.');
      }
      preferences.theme = theme;
    }

    const updated = await this.users.setPreferences(id, preferences, resolvedTenantId);
    if (updated.isErr()) {
      throw new ConflictException(updated.error.message);
    }
    if (!updated.value) {
      throw new NotFoundException('User was not found in tenant.');
    }

    return toAuthenticatedUserView(updated.value);
  }

  createSession(
    user: AuthUserRecord,
    claims: AuthMethodClaims = {
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
      authChannel: AuthProviderChannel.Password,
      authTime: Math.floor(Date.now() / 1000),
    },
  ): AuthSessionView {
    return createAuthSession(user, claims);
  }

  createUserSession(user: AuthUserRecord): AuthSessionView {
    return this.createSession(user);
  }

  private async issueUserActionToken(
    input: UserActionTokenInput,
    purpose: AuthUserTokenPurpose,
  ): Promise<string | null> {
    const tenantId = parseTenantId(input.tenantId);
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email, tenantId);
    if (user.isErr() || !user.value) {
      return null;
    }

    const issued = await this.tokens.issueUserActionToken({
      tenantId,
      userId: user.value.id,
      purpose,
    });
    if (issued.isErr()) {
      return null;
    }
    if (this.authNotifications) {
      await this.authNotifications.publishUserAction({
        userId: user.value.id,
        purpose,
        token: issued.value.token,
      });
    }
    return issued.value.token;
  }

  /**
   * Burns a one-time recovery code and returns the account it was issued for.
   *
   * Unknown, expired, already-consumed, and wrong-purpose codes all fail identically: telling
   * them apart would turn the confirm routes into an oracle for which codes exist.
   */
  private async redeemUserActionToken(
    input: UserActionTokenConfirmInput,
    purpose: AuthUserTokenPurpose,
  ): Promise<UserActionTokenRecord> {
    const consumed = await this.tokens.consumeUserActionToken(input.token, purpose, parseTenantId(input.tenantId));
    if (consumed.isErr() || !consumed.value) {
      throw new UnauthorizedException('Recovery code is invalid or has already been used.');
    }

    return consumed.value;
  }

  private requireRecoveredUser(result: Awaited<ReturnType<AuthUserStore['verifyEmail']>>): AuthenticatedUserView {
    if (result.isErr()) {
      throw new ConflictException(result.error.message);
    }
    if (!result.value) {
      throw new NotFoundException('User was not found in tenant.');
    }

    return toAuthenticatedUserView(result.value);
  }

  private async recordPasswordMethod(user: AuthUserRecord): Promise<void> {
    if (!this.social) {
      return;
    }
    await this.social.upsertMethod({
      tenantId: user.tenantId,
      userId: user.id,
      method: AuthProviderChannel.Password,
      amr: ['pwd'],
      lastUsedAt: new Date(),
    });
  }
}
