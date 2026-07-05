import { describe, expect, it } from "vitest";
import {
  AuthenticatedTheme,
  DefaultAuthTenantId,
} from "@app/backend-feature-auth-shared";
import { createAuthSession, toSessionPrincipal } from "./auth-session.factory";

const jwtEnv = {
  AUTH_JWT_SECRET: "testJwtSecretValue_at_least_32_chars",
};

const baseUser = {
  id: "user-id",
  tenantId: DefaultAuthTenantId,
  email: null,
  displayName: null,
  passwordHash: "hash",
  roles: ["user"],
  permissions: ["profile:read"],
  locale: "uz" as never,
  theme: AuthenticatedTheme.System,
  status: "active" as const,
  lastLoginAt: null,
};

describe("auth session factory", () => {
  it("omits optional auth claims and normalizes nullable principal fields", () => {
    const session = createAuthSession(baseUser, jwtEnv, undefined, {});
    const principal = toSessionPrincipal(session);

    expect(session).not.toHaveProperty("amr");
    expect(session).not.toHaveProperty("authProvider");
    expect(session).not.toHaveProperty("authChannel");
    expect(session).not.toHaveProperty("authTime");
    expect(session).not.toHaveProperty("externalIdentityId");
    expect(session).not.toHaveProperty("refreshToken");
    expect(principal.email).toBeUndefined();
    expect(principal.locale).toBeUndefined();
  });
});
