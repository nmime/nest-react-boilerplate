import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { SessionAuthGuard, setSessionPrincipal } from "./session-auth.guard";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";

const principal: AuthenticatedPrincipal = {
  subject: "user-1",
  email: "user@example.com",
  roles: ["user"],
  permissions: ["profile:read"],
};

const createContext = (request: AuthenticatedRequest) =>
  ({
    getClass: () => class TestController {},
    getHandler: () =>
      function handler() {
        return undefined;
      },
    switchToHttp: () => ({ getRequest: () => request }),
  }) as never;

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
});
