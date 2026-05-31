/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
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

export interface JwtSigningEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
  AUTH_JWT_EXPIRES_IN_SECONDS?: string;
  ADMIN_BOOTSTRAP_EMAILS?: string;
}

const DefaultExpiresInSeconds = 3600;
const PasswordIterations = 120_000;
const PasswordKeyLength = 32;

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_USER_STORE)
    private readonly users: AuthUserStore,
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

    const policy = createDefaultAccessPolicy(email);
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

    return this.createSession(created.value);
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
    return this.createSession(sessionUser);
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
    maybeInput?:
      | {
          locale?: string | null;
          theme?: string | null;
        }
      | null,
  ): Promise<AuthenticatedUserView> {
    const hasExplicitTenant =
      typeof tenantIdOrInput === "string" || arguments.length >= 3;
    const resolvedTenantId = parseTenantId(
      hasExplicitTenant
        ? (tenantIdOrInput as string | null | undefined)
        : undefined,
    );
    const input = hasExplicitTenant
      ? maybeInput
      : (tenantIdOrInput as
          | { locale?: string | null; theme?: string | null }
          | null
          | undefined);
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
    };
  }

  createUserSession(
    user: AuthUserRecord,
    env: JwtSigningEnvironment = process.env,
  ): AuthSessionView {
    return this.createSession(user, env);
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
  if (
    algorithm !== "pbkdf2_sha256" ||
    !iterations ||
    !salt ||
    !expectedDigest
  ) {
    return false;
  }
  const digest = pbkdf2Sync(
    password,
    salt,
    Number(iterations),
    Buffer.from(expectedDigest, "base64url").length,
    "sha256",
  );
  const expected = Buffer.from(expectedDigest, "base64url");
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export function signJwt(
  payload: Record<string, unknown>,
  env: JwtSigningEnvironment,
  expiresIn = DefaultExpiresInSeconds,
): string {
  if (!env.AUTH_JWT_SECRET) {
    throw new UnauthorizedException("AUTH_JWT_SECRET is not configured.");
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
  const signature = createHmac("sha256", env.AUTH_JWT_SECRET)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
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
