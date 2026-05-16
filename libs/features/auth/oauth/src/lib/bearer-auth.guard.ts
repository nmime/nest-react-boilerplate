import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_AUTH_METADATA_KEY } from "./access-control.decorators";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
  JwtValidationEnvironment,
} from "./access-control.types";

type JwtHeader = {
  alg?: string;
  typ?: string;
};

type JwtPayload = Record<string, unknown> & {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  jti?: string;
  name?: string;
  nbf?: number;
  permissions?: unknown;
  roles?: unknown;
  scope?: unknown;
  sub?: string;
};

const HMAC_ALGORITHMS: Record<string, string> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512",
};

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = validateBearerAuthorization(
      readAuthorizationHeader(request),
      process.env,
    );
    request.user = principal;
    request.auth = principal;

    return request.user === principal && request.auth === principal;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }
}

export function validateBearerAuthorization(
  authorizationHeader: string | undefined,
  env: JwtValidationEnvironment = process.env,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): AuthenticatedPrincipal {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new UnauthorizedException("AUTH_JWT_SECRET is not configured.");
  }

  const token = extractBearerToken(authorizationHeader);
  const { header, payload, signingInput, signature } = parseJwt(token);
  verifyHeader(header);
  verifySignature(header, signingInput, signature, secret);
  verifyTimeClaims(payload, nowInSeconds);
  verifyIssuer(payload, env.AUTH_JWT_ISSUER);
  verifyAudience(payload, env.AUTH_JWT_AUDIENCE);

  return principalFromPayload(payload);
}

function readAuthorizationHeader(
  request: AuthenticatedRequest,
): string | undefined {
  const directHeader =
    request.headers?.authorization ?? request.headers?.Authorization;
  if (Array.isArray(directHeader)) {
    return directHeader[0];
  }
  if (typeof directHeader === "string") {
    return directHeader;
  }

  return request.get?.("authorization") ?? request.get?.("Authorization");
}

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader) {
    throw new UnauthorizedException("Missing bearer token.");
  }

  const trimmed = authorizationHeader.trim();
  const separatorIndex = trimmed.indexOf(" ");
  if (separatorIndex < 0) {
    throw new UnauthorizedException("Missing bearer token.");
  }

  const scheme = trimmed.slice(0, separatorIndex);
  const token = trimmed.slice(separatorIndex + 1).trim();
  if (scheme.toLowerCase() !== "bearer" || token.length === 0) {
    throw new UnauthorizedException("Missing bearer token.");
  }

  return token;
}

function parseJwt(token: string): {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: string;
  signature: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new UnauthorizedException("Malformed JWT.");
  }

  const [encodedHeader, encodedPayload, signature] = parts as [
    string,
    string,
    string,
  ];

  return {
    header: decodeJson<JwtHeader>(encodedHeader, "JWT header"),
    payload: decodeJson<JwtPayload>(encodedPayload, "JWT payload"),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature,
  };
}

function decodeJson<T>(encoded: string, label: string): T {
  try {
    return JSON.parse(base64UrlDecode(encoded).toString("utf8")) as T;
  } catch {
    throw new UnauthorizedException(`Malformed ${label}.`);
  }
}

function verifyHeader(header: JwtHeader): void {
  if (header.alg === "none") {
    throw new UnauthorizedException("JWT alg none is not allowed.");
  }
  if (!header.alg || !HMAC_ALGORITHMS[header.alg]) {
    throw new UnauthorizedException("Unsupported JWT algorithm.");
  }
}

function verifySignature(
  header: JwtHeader,
  signingInput: string,
  signature: string,
  secret: string,
): void {
  const digest = createHmac(HMAC_ALGORITHMS[header.alg as string], secret)
    .update(signingInput)
    .digest();
  const provided = base64UrlDecode(signature);

  if (provided.length !== digest.length || !timingSafeEqual(provided, digest)) {
    throw new UnauthorizedException("Invalid JWT signature.");
  }
}

function verifyTimeClaims(payload: JwtPayload, nowInSeconds: number): void {
  if (typeof payload.exp === "number" && payload.exp <= nowInSeconds) {
    throw new UnauthorizedException("JWT is expired.");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowInSeconds) {
    throw new UnauthorizedException("JWT is not active yet.");
  }
}

function verifyIssuer(
  payload: JwtPayload,
  expectedIssuer: string | undefined,
): void {
  if (expectedIssuer && payload.iss !== expectedIssuer) {
    throw new UnauthorizedException("JWT issuer mismatch.");
  }
}

function verifyAudience(
  payload: JwtPayload,
  expectedAudience: string | undefined,
): void {
  if (!expectedAudience) {
    return;
  }

  const audience = payload.aud;
  const matches = Array.isArray(audience)
    ? audience.includes(expectedAudience)
    : audience === expectedAudience;

  if (!matches) {
    throw new UnauthorizedException("JWT audience mismatch.");
  }
}

function principalFromPayload(payload: JwtPayload): AuthenticatedPrincipal {
  if (!payload.sub) {
    throw new UnauthorizedException("JWT subject is required.");
  }

  const permissions = uniqueStrings([
    ...claimToStrings(payload.permissions),
    ...claimToStrings(payload.scope),
  ]);

  return {
    subject: payload.sub,
    email: payload.email,
    displayName: typeof payload.name === "string" ? payload.name : undefined,
    issuer: payload.iss,
    audience: payload.aud,
    roles: uniqueStrings(claimToStrings(payload.roles)),
    permissions,
    tokenId: payload.jti,
  };
}

function claimToStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  if (typeof value === "string") {
    return value
      .split(" ")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}
