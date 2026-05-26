import { createHmac } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateBearerAuthorization } from "./bearer-auth.guard";

const Secret = "jwt-test-secret";
const Now = 1_700_000_000;

function signToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", ...header })),
  );
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify({ exp: Now + 60, ...payload })),
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(
    createHmac("sha256", Secret).update(signingInput).digest(),
  );

  return `${signingInput}.${signature}`;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

describe("validateBearerAuthorization", () => {
  it("validates a signed HMAC bearer token and maps claims", () => {
    const token = signToken({
      aud: ["web", "api"],
      email: "admin@example.com",
      iss: "issuer",
      jti: "token-id",
      locale: "es-MX",
      name: "Admin User",
      permissions: ["profile:read", "profile:read"],
      roles: "admin operator",
      scope: "profile:write settings:read",
      sub: "user-id",
      theme: "dark",
    });

    const principal = validateBearerAuthorization(
      `Bearer ${token}`,
      {
        AUTH_JWT_AUDIENCE: "api",
        AUTH_JWT_ISSUER: "issuer",
        AUTH_JWT_SECRET: Secret,
      },
      Now,
    );

    expect(principal).toEqual({
      audience: ["web", "api"],
      displayName: "Admin User",
      email: "admin@example.com",
      issuer: "issuer",
      locale: "es",
      permissions: ["profile:read", "profile:write", "settings:read"],
      roles: ["admin", "operator"],
      subject: "user-id",
      theme: "dark",
      tokenId: "token-id",
    });
  });

  it("requires a configured JWT secret", () => {
    expect(() => validateBearerAuthorization("Bearer token", {}, Now)).toThrow(
      new UnauthorizedException("AUTH_JWT_SECRET is not configured."),
    );
  });

  it("rejects a missing bearer token", () => {
    expect(() =>
      validateBearerAuthorization(undefined, { AUTH_JWT_SECRET: Secret }, Now),
    ).toThrow(new UnauthorizedException("Missing bearer token."));
  });

  it("rejects a token with an invalid signature", () => {
    const token = signToken({ sub: "user-id" });

    expect(() =>
      validateBearerAuthorization(
        `Bearer ${token}tampered`,
        { AUTH_JWT_SECRET: Secret },
        Now,
      ),
    ).toThrow(new UnauthorizedException("Invalid JWT signature."));
  });

  it("rejects expired tokens", () => {
    const token = signToken({ exp: Now - 1, sub: "user-id" });

    expect(() =>
      validateBearerAuthorization(
        `Bearer ${token}`,
        { AUTH_JWT_SECRET: Secret },
        Now,
      ),
    ).toThrow(new UnauthorizedException("JWT is expired."));
  });

  it("rejects issuer and audience mismatches", () => {
    const token = signToken({ aud: "web", iss: "issuer", sub: "user-id" });

    expect(() =>
      validateBearerAuthorization(
        `Bearer ${token}`,
        { AUTH_JWT_AUDIENCE: "api", AUTH_JWT_SECRET: Secret },
        Now,
      ),
    ).toThrow(new UnauthorizedException("JWT audience mismatch."));

    expect(() =>
      validateBearerAuthorization(
        `Bearer ${token}`,
        { AUTH_JWT_ISSUER: "other", AUTH_JWT_SECRET: Secret },
        Now,
      ),
    ).toThrow(new UnauthorizedException("JWT issuer mismatch."));
  });
});
