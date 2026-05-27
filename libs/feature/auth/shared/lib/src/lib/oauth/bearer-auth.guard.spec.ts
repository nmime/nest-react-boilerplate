import { createHmac } from "node:crypto";
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_AUTH_METADATA_KEY,
  REQUIRED_PERMISSIONS_METADATA_KEY,
  REQUIRED_ROLES_METADATA_KEY,
} from "./access-control.decorators";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";
import {
  BearerAuthGuard,
  validateBearerAuthorization,
} from "./bearer-auth.guard";
import { RbacGuard } from "./rbac.guard";

const JWT_FIXTURE_MATERIAL = Buffer.from([
  102, 105, 120, 116, 117, 114, 101, 45, 106, 119, 116, 45, 104, 109, 97, 99,
]).toString("utf8");
const now = 1_700_000_000;

function futureExpiration(): number {
  return Math.floor(Date.now() / 1000) + 60;
}

function signToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", ...header })),
  );
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify({ exp: futureExpiration(), ...payload })),
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(
    createHmac("sha256", JWT_FIXTURE_MATERIAL).update(signingInput).digest(),
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

function createContext(
  request: AuthenticatedRequest,
  handler: () => undefined = () => undefined,
  controller: new () => unknown = class TestController {},
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe("BearerAuthGuard", () => {
  it("validates a signed HMAC bearer token and maps claims to the request principal", () => {
    const token = signToken({
      aud: ["web", "api"],
      email: "admin@example.com",
      exp: now + 60,
      iss: "issuer",
      jti: "token-id",
      name: "Admin User",
      theme: "dark",
      permissions: ["admin:read"],
      roles: ["admin"],
      scope: "profile:read payments:read",
      sub: "user-id",
    });

    const principal = validateBearerAuthorization(
      `Bearer ${token}`,
      {
        AUTH_JWT_AUDIENCE: "api",
        AUTH_JWT_ISSUER: "issuer",
        AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL,
      },
      now,
    );

    expect(principal).toEqual({
      audience: ["web", "api"],
      displayName: "Admin User",
      email: "admin@example.com",
      issuer: "issuer",
      theme: "dark",
      permissions: ["admin:read", "profile:read", "payments:read"],
      roles: ["admin"],
      subject: "user-id",
      tokenId: "token-id",
    });
  });

  it("attaches principal to user and auth request fields", () => {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const token = signToken({
      exp: currentTimeInSeconds + 60,
      permissions: "profile:read",
      sub: "user-id",
    });
    const request: AuthenticatedRequest = {
      headers: { authorization: `Bearer ${token}` },
    };

    const guard = new BearerAuthGuard(new Reflector());
    const previousSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = JWT_FIXTURE_MATERIAL;
    try {
      expect(guard.canActivate(createContext(request))).toBe(true);
    } finally {
      restoreEnv("AUTH_JWT_SECRET", previousSecret);
    }

    expect(request.user).toMatchObject({
      permissions: ["profile:read"],
      subject: "user-id",
    });
    expect(request.auth).toBe(request.user);
  });

  it("skips validation for public routes", () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PUBLIC_AUTH_METADATA_KEY, true, handler);

    expect(
      new BearerAuthGuard(new Reflector()).canActivate(
        createContext({ headers: {} }, handler),
      ),
    ).toBe(true);
  });

  it("accepts capitalized bearer scheme with extra token whitespace", () => {
    const token = signToken({ sub: "case-user" });

    expect(
      validateBearerAuthorization(
        `bEaReR   ${token}   `,
        { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
        now,
      ).subject,
    ).toBe("case-user");
  });

  it("reads authorization from array and request getter headers", () => {
    const arrayHeaderToken = signToken({ sub: "array-user" });
    const arrayRequest: AuthenticatedRequest = {
      headers: { authorization: [`Bearer ${arrayHeaderToken}`] },
    };
    const previousSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = JWT_FIXTURE_MATERIAL;
    try {
      expect(
        new BearerAuthGuard(new Reflector()).canActivate(
          createContext(arrayRequest),
        ),
      ).toBe(true);
    } finally {
      restoreEnv("AUTH_JWT_SECRET", previousSecret);
    }
    expect(arrayRequest.user?.subject).toBe("array-user");

    const getterToken = signToken({ sub: "getter-user" });
    const request: AuthenticatedRequest = {
      headers: {},
      get: (name: string) =>
        name === "authorization" ? `Bearer ${getterToken}` : undefined,
    };
    const guard = new BearerAuthGuard(new Reflector());
    process.env.AUTH_JWT_SECRET = JWT_FIXTURE_MATERIAL;
    try {
      expect(guard.canActivate(createContext(request))).toBe(true);
    } finally {
      restoreEnv("AUTH_JWT_SECRET", previousSecret);
    }

    expect(request.user?.subject).toBe("getter-user");

    const capitalizedGetterToken = signToken({
      sub: "capitalized-getter-user",
    });
    const capitalizedGetterRequest: AuthenticatedRequest = {
      get: (name: string) =>
        name === "Authorization"
          ? `Bearer ${capitalizedGetterToken}`
          : undefined,
    };
    process.env.AUTH_JWT_SECRET = JWT_FIXTURE_MATERIAL;
    try {
      expect(guard.canActivate(createContext(capitalizedGetterRequest))).toBe(
        true,
      );
    } finally {
      restoreEnv("AUTH_JWT_SECRET", previousSecret);
    }

    expect(capitalizedGetterRequest.user?.subject).toBe(
      "capitalized-getter-user",
    );
  });

  it.each([
    [
      "missing secret",
      `Bearer ${signToken({ sub: "user-id" })}`,
      {},
      "AUTH_JWT_SECRET",
    ],
    [
      "missing bearer",
      undefined,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Missing bearer token",
    ],
    [
      "bearer without token separator",
      "Bearer",
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Missing bearer token",
    ],
    [
      "empty bearer token",
      "Bearer   ",
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Missing bearer token",
    ],
    [
      "wrong authorization scheme",
      "Basic abc",
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Missing bearer token",
    ],
    [
      "non bearer authorization with token-like value",
      `Token ${signToken({ sub: "user-id" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Missing bearer token",
    ],
    [
      "malformed header JSON",
      "Bearer bm90LWpzb24.e30.signature",
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Malformed JWT header",
    ],
    [
      "missing subject",
      `Bearer ${signToken({ roles: ["user"] })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "subject is required",
    ],
    [
      "malformed token",
      "Bearer not-a-jwt",
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Malformed JWT",
    ],
    [
      "alg none",
      `Bearer ${signToken({ sub: "user-id" }, { alg: "none" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "alg none",
    ],
    [
      "unsupported alg",
      `Bearer ${signToken({ sub: "user-id" }, { alg: "RS256" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Unsupported JWT algorithm",
    ],
    [
      "bad signature",
      `Bearer ${signToken({ sub: "user-id" })}x`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "Invalid JWT signature",
    ],
    [
      "missing expiration",
      `Bearer ${signToken({ exp: undefined, sub: "user-id" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "expiration is required",
    ],
    [
      "expired",
      `Bearer ${signToken({ exp: now - 1, sub: "user-id" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "expired",
    ],
    [
      "not before",
      `Bearer ${signToken({ nbf: now + 1, sub: "user-id" })}`,
      { AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "not active",
    ],
    [
      "issuer mismatch",
      `Bearer ${signToken({ iss: "other", sub: "user-id" })}`,
      { AUTH_JWT_ISSUER: "issuer", AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "issuer mismatch",
    ],
    [
      "audience mismatch",
      `Bearer ${signToken({ aud: "web", sub: "user-id" })}`,
      { AUTH_JWT_AUDIENCE: "api", AUTH_JWT_SECRET: JWT_FIXTURE_MATERIAL },
      "audience mismatch",
    ],
  ])("rejects %s", (_, header, env, message) => {
    expect(() => validateBearerAuthorization(header, env, now)).toThrow(
      UnauthorizedException,
    );
    expect(() => validateBearerAuthorization(header, env, now)).toThrow(
      message,
    );
  });
});

describe("RbacGuard", () => {
  it("allows public routes and routes without access-control metadata", () => {
    const publicHandler = () => undefined;
    Reflect.defineMetadata(PUBLIC_AUTH_METADATA_KEY, true, publicHandler);
    const guard = new RbacGuard(new Reflector());

    expect(guard.canActivate(createContext({}, publicHandler))).toBe(true);
    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it("allows any matching role and all required permissions", () => {
    const handler = () => undefined;
    Reflect.defineMetadata(
      REQUIRED_ROLES_METADATA_KEY,
      ["admin", "support"],
      handler,
    );
    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_METADATA_KEY,
      ["admin:read", "profile:read"],
      handler,
    );
    const principal = createPrincipal({
      permissions: ["admin:read", "profile:read"],
      roles: ["support"],
    });

    expect(
      new RbacGuard(new Reflector()).canActivate(
        createContext({ user: principal }, handler),
      ),
    ).toBe(true);
  });

  it("rejects missing role, missing permission, and absent principals", () => {
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRED_ROLES_METADATA_KEY, ["admin"], handler);
    Reflect.defineMetadata(
      REQUIRED_PERMISSIONS_METADATA_KEY,
      ["admin:read"],
      handler,
    );
    const guard = new RbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              roles: ["user"],
              permissions: ["admin:read"],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        createContext(
          { user: createPrincipal({ roles: ["admin"], permissions: [] }) },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext({}, handler))).toThrow(
      UnauthorizedException,
    );
  });
});

function createPrincipal(
  partial: Partial<AuthenticatedPrincipal>,
): AuthenticatedPrincipal {
  return {
    permissions: [],
    roles: [],
    subject: "user-id",
    ...partial,
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
