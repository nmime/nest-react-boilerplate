import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
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
  type AuthenticatedPrincipal,
  normalizeUserThemePreference,
  resolveTenantId,
  normalizeTenantId,
  toAuthenticatedUserView,
  type AuthSessionView,
  type AuthenticatedUserView,
  type UserThemePreference,
  Language,
} from "@app/feature-auth-shared";
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

export interface JwtSigningEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
  AUTH_JWT_EXPIRES_IN_SECONDS?: string;
  ADMIN_BOOTSTRAP_EMAILS?: string;
  NODE_ENV?: string;
}

const DefaultExpiresInSeconds = 3600;
const PasswordIterations = 120_000;
const PasswordKeyLength = 32;
const MaximumPasswordHashIterations = 1_000_000;
const MaximumPasswordDigestLength = 128;
const MinimumProductionJwtSecretLength = 32;

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_USER_STORE)
    private readonly users: AuthUserStore,
    @Optional()
    @Inject(AUTH_TOKEN_STORE)
    private readonly tokens: AuthTokenStore = new InMemoryAuthTokenStore(),
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
  ): AuthSessionView {
    const expiresIn = readExpiresInSeconds(env.AUTH_JWT_EXPIRES_IN_SECONDS);
    const view = toAuthenticatedUserView(user);
    return {
      user: view,
      accessToken: signJwt(
        {
          sub: view.id,
          tid: view.tenantId,
          tenantId: view.tenantId,
          email: view.email,
          name: view.displayName,
          locale: view.locale,
          theme: view.theme,
          roles: view.roles,
          permissions: view.permissions,
        },
        env,
        expiresIn,
      ),
      tokenType: "Bearer",
      expiresIn,
      ...(refreshToken ? { refreshToken } : {}),
    };
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
}

export function toSessionPrincipal(
  session: AuthSessionView,
): AuthenticatedPrincipal {
  return {
    subject: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email,
    displayName: session.user.displayName,
    locale: session.user.locale as Language,
    theme: session.user.theme,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };
}

export function parseTenantId(value: string | null | undefined): string {
  if (value && !normalizeTenantId(value)) {
    throw new BadRequestException("Invalid tenant id.");
  }
  return resolveTenantId(value);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString("base64url"),
): string {
  const digest = pbkdf2Sync(
    password,
    salt,
    PasswordIterations,
    PasswordKeyLength,
    "sha256",
  ).toString("base64url");
  return `pbkdf2_sha256$${PasswordIterations}$${salt}$${digest}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [algorithm, iterations, salt, expectedDigest] = encodedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !salt || !expectedDigest) {
    return false;
  }

  const parsedIterations = parsePasswordHashIterations(iterations);
  if (!parsedIterations) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(expectedDigest, "base64url");
  } catch {
    return false;
  }

  if (
    expected.length === 0 ||
    expected.length > MaximumPasswordDigestLength
  ) {
    return false;
  }

  const digest = pbkdf2Sync(
    password,
    salt,
    parsedIterations,
    expected.length,
    "sha256",
  );
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export function signJwt(
  payload: Record<string, unknown>,
  env: JwtSigningEnvironment,
  expiresIn = DefaultExpiresInSeconds,
): string {
  const secret = env.AUTH_JWT_SECRET?.trim();
  if (!secret) {
    throw new UnauthorizedException("AUTH_JWT_SECRET is not configured.");
  }
  if (
    env.NODE_ENV === "production" &&
    secret.length < MinimumProductionJwtSecretLength
  ) {
    throw new UnauthorizedException(
      "AUTH_JWT_SECRET must be at least 32 characters (excluding leading/trailing whitespace) in production.",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    ...(env.AUTH_JWT_ISSUER ? { iss: env.AUTH_JWT_ISSUER } : {}),
    ...(env.AUTH_JWT_AUDIENCE ? { aud: env.AUTH_JWT_AUDIENCE } : {}),
    iat: now,
    exp: now + expiresIn,
  };
  const signingInput = `${base64UrlJson({ alg: "HS256", typ: "JWT" })}.${base64UrlJson(fullPayload)}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parsePasswordHashIterations(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isInteger(parsed) ||
    String(parsed) !== value ||
    parsed < 1 ||
    parsed > MaximumPasswordHashIterations
  ) {
    return null;
  }

  return parsed;
}

function readExpiresInSeconds(value: string | undefined): number {
  if (!value) {
    return DefaultExpiresInSeconds;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DefaultExpiresInSeconds;
}
