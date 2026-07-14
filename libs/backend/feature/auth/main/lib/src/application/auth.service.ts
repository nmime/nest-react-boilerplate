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
import { normalizeLocale } from '@app/common-i18n';
import {
  AuthUserStoreInjectToken,
  type AuthUserRecord,
  type AuthUserStore,
  AuthTokenStoreInjectToken,
  type AuthTokenStore,
  type AuthUserTokenPurpose,
  InMemoryAuthTokenStore,
  SocialAuthStoreInjectToken,
  type SocialAuthStore,
} from '../infrastructure';
import { createAuthSession } from './auth-session.factory';
import { EffectivePermissionService } from './effective-permission.service';
import {
  normalizeEmail,
  AuthJwtSigningError,
  type JwtSigningEnvironment,
  hashPassword,
  verifyPassword,
} from '../domain';
import type {
  LoginInput,
  RefreshSessionInput,
  RegisterUserInput,
  UserActionTokenInput,
} from './type/auth-service.type';
import { parseTenantId } from './util/auth-error-adapter.util';

// Input DTOs and the JWT/tenant exception-translation helpers were decomposed
// into role-based sibling files; they are re-exported here so the application
// barrel stays stable.
export * from './type/auth-service.type';
export * from './util/auth-error-adapter.util';

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

    // Assign bootstrap ROLES; the effective-permission resolver then refreshes
    // the denormalized cache from the normalized RBAC tables. The user is
    // created with the matrix-derived arrays up front so the cache is correct
    // even when no resolver/DB is wired (pure in-memory unit tests).
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

    return this.createSession(sessionUser, process.env, await this.issueRefreshTokenForUser(sessionUser));
  }

  // Assign the bootstrap roles to a freshly created user and refresh the
  // denormalized jsonb cache from the normalized RBAC tables. When no resolver
  // is wired (in-memory unit tests), the account already carries the
  // matrix-derived arrays from `create`, so the record is returned unchanged.
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
    return this.createSession(sessionUser, process.env, await this.issueRefreshTokenForUser(sessionUser));
  }

  async refreshSession(input: RefreshSessionInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const existing = await this.tokens.findRefreshToken(input.refreshToken, tenantId);
    if (existing.isErr() || !existing.value) {
      // The token is not currently usable. Still attempt rotation so a replay of
      // an already-rotated token can trigger refresh-token family reuse detection.
      await this.tokens.rotateRefreshToken(input.refreshToken, tenantId);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // Verify the user is active before rotating so a deactivated user's token is
    // rejected without being rotated into an orphaned replacement.
    const user = await this.users.findById(existing.value.userId, tenantId);
    if (user.isErr() || !user.value || user.value.status !== 'active') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const rotated = await this.tokens.rotateRefreshToken(input.refreshToken, tenantId);
    if (rotated.isErr() || !rotated.value) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return this.createSession(user.value, process.env, rotated.value.token);
  }

  async revokeRefreshToken(input: RefreshSessionInput): Promise<boolean> {
    const tenantId = parseTenantId(input.tenantId);
    const revoked = await this.tokens.revokeRefreshToken(input.refreshToken, tenantId);
    if (revoked.isErr()) {
      return false;
    }

    return revoked.value;
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

    if (Object.hasOwn(input, 'locale')) {
      const locale = normalizeLocale(input.locale);
      if (!locale) {
        throw new BadRequestException('Unsupported locale.');
      }
      preferences.locale = locale;
    }

    if (Object.hasOwn(input, 'theme')) {
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
    env: JwtSigningEnvironment = process.env,
    refreshToken?: string,
    claims: AuthMethodClaims = {
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
      authChannel: AuthProviderChannel.Password,
      authTime: Math.floor(Date.now() / 1000),
    },
  ): AuthSessionView {
    try {
      return createAuthSession(user, env, refreshToken, claims);
    } catch (error) {
      if (error instanceof AuthJwtSigningError) {
        throw new UnauthorizedException(error.message);
      }

      throw error;
    }
  }

  createUserSession(user: AuthUserRecord, env: JwtSigningEnvironment = process.env): AuthSessionView {
    return this.createSession(user, env);
  }

  private async issueRefreshTokenForUser(user: AuthUserRecord): Promise<string | undefined> {
    const issued = await this.tokens.issueRefreshToken({
      tenantId: user.tenantId,
      userId: user.id,
    });
    return issued.isOk() ? issued.value.token : undefined;
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
    return issued.isOk() ? issued.value.token : null;
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
