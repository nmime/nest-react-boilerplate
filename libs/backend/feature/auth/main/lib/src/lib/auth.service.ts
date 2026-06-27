import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createDefaultAccessPolicy,
  normalizeUserThemePreference,
  toAuthenticatedUserView,
  type AuthSessionView,
  type AuthMethodClaims,
  type AuthenticatedUserView,
  type UserThemePreference,
} from "@app/backend/feature/auth/shared";
import { normalizeLocale } from "@app/common/i18n";
import {
  AUTH_USER_STORE,
  type AuthUserRecord,
  type AuthUserStore,
} from "./auth-user-store";
import {
  AUTH_TOKEN_STORE,
  type AuthTokenStore,
  type AuthUserTokenPurpose,
  InMemoryAuthTokenStore,
} from "./auth-token-store";
import { SOCIAL_AUTH_STORE, type SocialAuthStore } from "./social-auth-store";
import { createAuthSession } from "./application/auth-session.factory";
import { normalizeEmail } from "./domain/email-address";
import {
  AuthJwtSigningError,
  signJwt as signDomainJwt,
  type JwtSigningEnvironment,
} from "./domain/jwt-signer";
import { hashPassword, verifyPassword } from "./domain/password.service";
import {
  InvalidAuthTenantIdError,
  parseTenantId as parseDomainTenantId,
} from "./domain/tenant-id";

export { toSessionPrincipal } from "./application/auth-session.factory";
export { normalizeEmail } from "./domain/email-address";
export type { JwtSigningEnvironment } from "./domain/jwt-signer";
export { hashPassword, verifyPassword } from "./domain/password.service";

export interface RegisterUserInput {
  tenantId?: string | null;
  email: string;
  password: string;
  displayName?: string;
  locale?: string | null;
  theme?: string | null;
}

export interface LoginInput {
  tenantId?: string | null;
  email: string;
  password: string;
}

export interface RefreshSessionInput {
  tenantId?: string | null;
  refreshToken: string;
}

export interface UserActionTokenInput {
  tenantId?: string | null;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_USER_STORE)
    private readonly users: AuthUserStore,
    @Optional()
    @Inject(AUTH_TOKEN_STORE)
    private readonly tokens: AuthTokenStore = new InMemoryAuthTokenStore(),
    @Optional()
    @Inject(SOCIAL_AUTH_STORE)
    private readonly social?: SocialAuthStore,
  ) {}

  async register(input: RegisterUserInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const email = normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email, tenantId);
    if (existing.isErr()) {
      throw new ConflictException(existing.error.message);
    }
    if (existing.value) {
      throw new ConflictException("Email is already registered for tenant.");
    }

    const policy = createDefaultAccessPolicy(email, process.env, tenantId);
    const created = await this.users.create({
      tenantId,
      email,
      displayName: input.displayName?.trim() || null,
      passwordHash: hashPassword(input.password),
      locale: normalizeLocale(input.locale),
      theme: normalizeUserThemePreference(input.theme),
      roles: policy.roles,
      permissions: policy.permissions,
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }
    await this.recordPasswordMethod(created.value);

    return this.createSession(
      created.value,
      process.env,
      await this.issueRefreshTokenForUser(created.value),
    );
  }

  async login(input: LoginInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email, tenantId);
    if (
      user.isErr() ||
      !user.value ||
      !verifyPassword(input.password, user.value.passwordHash)
    ) {
      throw new UnauthorizedException("Invalid email or password.");
    }
    if (user.value.status !== "active") {
      throw new UnauthorizedException("User is not active.");
    }

    const loggedIn = await this.users.recordLogin(
      user.value.id,
      new Date(),
      tenantId,
    );
    const sessionUser =
      loggedIn.isOk() && loggedIn.value ? loggedIn.value : user.value;
    await this.recordPasswordMethod(sessionUser);
    return this.createSession(
      sessionUser,
      process.env,
      await this.issueRefreshTokenForUser(sessionUser),
    );
  }

  async refreshSession(input: RefreshSessionInput): Promise<AuthSessionView> {
    const tenantId = parseTenantId(input.tenantId);
    const rotated = await this.tokens.rotateRefreshToken(
      input.refreshToken,
      tenantId,
    );
    if (rotated.isErr() || !rotated.value) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const user = await this.users.findById(rotated.value.userId, tenantId);
    if (user.isErr() || !user.value || user.value.status !== "active") {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    return this.createSession(user.value, process.env, rotated.value.token);
  }

  async revokeRefreshToken(input: RefreshSessionInput): Promise<boolean> {
    const tenantId = parseTenantId(input.tenantId);
    const revoked = await this.tokens.revokeRefreshToken(
      input.refreshToken,
      tenantId,
    );
    if (revoked.isErr()) {
      return false;
    }

    return revoked.value;
  }

  async issueEmailVerificationToken(
    input: UserActionTokenInput,
  ): Promise<string | null> {
    return this.issueUserActionToken(input, "email_verification");
  }

  async issuePasswordResetToken(
    input: UserActionTokenInput,
  ): Promise<string | null> {
    return this.issueUserActionToken(input, "password_reset");
  }

  async consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string | null,
  ): Promise<boolean> {
    const consumed = await this.tokens.consumeUserActionToken(
      token,
      purpose,
      parseTenantId(tenantId),
    );
    return consumed.isOk() && Boolean(consumed.value);
  }

  async getUserById(
    id: string,
    tenantId?: string | null,
  ): Promise<AuthenticatedUserView | null> {
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
    const hasExplicitTenant =
      typeof tenantIdOrInput === "string" || arguments.length >= 3;
    const resolvedTenantId = parseTenantId(
      hasExplicitTenant
        ? (tenantIdOrInput as string | null | undefined)
        : undefined,
    );
    const input = hasExplicitTenant ? maybeInput : tenantIdOrInput;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("Preferences payload must be an object.");
    }

    const preferences: { locale?: ReturnType<typeof normalizeLocale> } & {
      theme?: UserThemePreference;
    } = {};

    if (Object.hasOwn(input, "locale")) {
      const locale = normalizeLocale(input.locale);
      if (!locale) {
        throw new BadRequestException("Unsupported locale.");
      }
      preferences.locale = locale;
    }

    if (Object.hasOwn(input, "theme")) {
      const theme = normalizeUserThemePreference(input.theme);
      if (!theme) {
        throw new BadRequestException("Unsupported theme.");
      }
      preferences.theme = theme;
    }

    const updated = await this.users.setPreferences(
      id,
      preferences,
      resolvedTenantId,
    );
    if (updated.isErr()) {
      throw new ConflictException(updated.error.message);
    }
    if (!updated.value) {
      throw new NotFoundException("User was not found in tenant.");
    }

    return toAuthenticatedUserView(updated.value);
  }

  createSession(
    user: AuthUserRecord,
    env: JwtSigningEnvironment = process.env,
    refreshToken?: string,
    claims: AuthMethodClaims = {
      amr: ["pwd"],
      authProvider: "password",
      authChannel: "password",
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

  createUserSession(
    user: AuthUserRecord,
    env: JwtSigningEnvironment = process.env,
  ): AuthSessionView {
    return this.createSession(user, env);
  }

  private async issueRefreshTokenForUser(
    user: AuthUserRecord,
  ): Promise<string | undefined> {
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
      method: "password",
      amr: ["pwd"],
      lastUsedAt: new Date(),
    });
  }
}

export function parseTenantId(value: string | null | undefined): string {
  try {
    return parseDomainTenantId(value);
  } catch (error) {
    if (error instanceof InvalidAuthTenantIdError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}

export function signJwt(
  payload: Record<string, unknown>,
  env: JwtSigningEnvironment,
  expiresIn?: number,
): string {
  try {
    return signDomainJwt(payload, env, expiresIn);
  } catch (error) {
    if (error instanceof AuthJwtSigningError) {
      throw new UnauthorizedException(error.message);
    }

    throw error;
  }
}
