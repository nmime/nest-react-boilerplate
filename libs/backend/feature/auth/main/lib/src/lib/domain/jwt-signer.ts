import { createHmac } from "node:crypto";

export interface JwtSigningEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
  AUTH_JWT_EXPIRES_IN_SECONDS?: string;
  ADMIN_BOOTSTRAP_EMAILS?: string;
  NODE_ENV?: string;
}

const DefaultExpiresInSeconds = 3600;
const MinimumProductionJwtSecretLength = 32;

export class AuthJwtSigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthJwtSigningError";
  }
}

export function signJwt(
  payload: Record<string, unknown>,
  env: JwtSigningEnvironment,
  expiresIn = DefaultExpiresInSeconds,
): string {
  const secret = env.AUTH_JWT_SECRET?.trim();
  if (!secret) {
    throw new AuthJwtSigningError("AUTH_JWT_SECRET is not configured.");
  }
  if (
    env.NODE_ENV === "production" &&
    secret.length < MinimumProductionJwtSecretLength
  ) {
    throw new AuthJwtSigningError(
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

export function readExpiresInSeconds(value: string | undefined): number {
  if (!value) {
    return DefaultExpiresInSeconds;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DefaultExpiresInSeconds;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
