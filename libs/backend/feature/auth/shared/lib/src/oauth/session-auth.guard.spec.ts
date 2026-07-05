import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PublicAuthMetadataKey } from "./access-control.decorators";
import {
  SessionAuthGuard,
  clearSessionPrincipal,
  setSessionPrincipal,
} from "./session-auth.guard";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";
import { DefaultAuthTenantId } from "./tenant-context";

const principal: AuthenticatedPrincipal = {
  subject: "user-1",
  tenantId: DefaultAuthTenantId,
  email: "user@example.com",
  roles: ["user"],
  permissions: ["profile:read"],
};

function signBearerToken(secret: string): string {
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: principal.subject,
        exp: Math.floor(Date.now() / 1000) + 60,
        roles: principal.roles,
        permissions: principal.permissions,
      }),
    ).toString("base64url"),
  ];
  const signature = createHmac("sha256", secret)
    .update(token.join("."))
    .digest("base64url");
  return `${token.join(".")}.${signature}`;
}

const createContext = (
  request: AuthenticatedRequest,
  handler: () => undefined = () => undefined,
): ExecutionContext => {
  const context: ExecutionContext = {
    getArgByIndex: () => request,
    getArgs: () => [request],
    getClass: () => class TestController {},
    getHandler: () => handler,
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
    switchToRpc: () => ({
      getContext: () => undefined,
      getData: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
  };
  return context;
};

describe("SessionAuthGuard", () => {
  it("accepts a persisted session principal", () => {
    const request = { session: {} } satisfies AuthenticatedRequest;
    setSessionPrincipal(request, principal);

    expect(new SessionAuthGuard().canActivate(createContext(request))).toBe(
      true,
    );
    expect(request.user).toEqual(principal);
  });

  it("falls back to bearer validation when no session is available", () => {
    process.env.AUTH_JWT_SECRET = "session-guard-test-secret-123456789";
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: principal.subject,
          email: principal.email,
          exp: Math.floor(Date.now() / 1000) + 60,
          roles: principal.roles,
          permissions: principal.permissions,
        }),
      ).toString("base64url"),
    ];
    const signature = createHmac("sha256", process.env.AUTH_JWT_SECRET)
      .update(token.join("."))
      .digest("base64url");
    const request = {
      headers: { authorization: `Bearer ${token.join(".")}.${signature}` },
    } satisfies AuthenticatedRequest;

    expect(new SessionAuthGuard().canActivate(createContext(request))).toBe(
      true,
    );
    expect(request.user).toMatchObject({ subject: principal.subject });
  });

  it("rejects requests without a session or bearer token", () => {
    process.env.AUTH_JWT_SECRET = "session-guard-test-secret-123456789";

    expect(() => new SessionAuthGuard().canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("skips authentication for public routes", () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PublicAuthMetadataKey, true, handler);

    expect(
      new SessionAuthGuard(new Reflector()).canActivate(
        createContext({}, handler),
      ),
    ).toBe(true);
  });

  it("reads a bearer token from an array authorization header", () => {
    const secret = "session-guard-test-secret-123456789";
    process.env.AUTH_JWT_SECRET = secret;
    const request: AuthenticatedRequest = {
      headers: { authorization: [`Bearer ${signBearerToken(secret)}`] },
    };

    expect(new SessionAuthGuard().canActivate(createContext(request))).toBe(
      true,
    );
    expect(request.user?.subject).toBe(principal.subject);
  });
});

describe("session principal lifecycle helpers", () => {
  it("sets request principal fields even without a server-side session", () => {
    const request = {} satisfies AuthenticatedRequest;

    setSessionPrincipal(request, principal);

    expect(request.session).toBeUndefined();
    expect(request.tenantId).toBe(principal.tenantId);
    expect(request.user).toEqual(principal);
    expect(request.auth).toEqual(principal);
  });

  it("clears the persisted session and request principal fields", () => {
    const request: AuthenticatedRequest = {
      session: { user: principal },
      tenantId: principal.tenantId,
      user: principal,
      auth: principal,
    };

    clearSessionPrincipal(request);

    expect(request.session?.user).toBeUndefined();
    expect(request.tenantId).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
  });

  it("clears request principal fields when no session is present", () => {
    const request = {
      tenantId: principal.tenantId,
      user: principal,
      auth: principal,
    } satisfies AuthenticatedRequest;

    clearSessionPrincipal(request);

    expect(request.tenantId).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
  });
});
