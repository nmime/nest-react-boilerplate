import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createDefaultAccessPolicy,
  toAuthenticatedUserView,
  type AuthSessionView,
  type AuthenticatedUserView,
} from "@app/features-auth-shared";
import {
  AUTH_USER_STORE,
  type AuthUserRecord,
  type AuthUserStore,
} from "./auth-user-store";

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
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
    const email = normalizeEmail(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing.isErr()) {
      throw new ConflictException(existing.error.message);
    }
    if (existing.value) {
      throw new ConflictException("Email is already registered.");
    }

    const policy = createDefaultAccessPolicy(email);
    const created = await this.users.create({
      email,
      displayName: input.displayName?.trim() || null,
      passwordHash: hashPassword(input.password),
      roles: policy.roles,
      permissions: policy.permissions,
    });
    if (created.isErr()) {
      throw new ConflictException(created.error.message);
    }

    return this.createSession(created.value);
  }

  async login(input: LoginInput): Promise<AuthSessionView> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);
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

    const loggedIn = await this.users.recordLogin(user.value.id);
    const sessionUser =
      loggedIn.isOk() && loggedIn.value ? loggedIn.value : user.value;
    return this.createSession(sessionUser);
  }

  async getUserById(id: string): Promise<AuthenticatedUserView | null> {
    const user = await this.users.findById(id);
    if (user.isErr() || !user.value) {
      return null;
    }

    return toAuthenticatedUserView(user.value);
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
          email: view.email,
          name: view.displayName,
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
