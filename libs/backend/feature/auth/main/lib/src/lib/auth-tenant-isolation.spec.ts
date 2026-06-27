import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateBearerAuthorization } from "@app/backend/feature/auth/shared";
import { InMemoryAuthUserStore } from "./auth-user-store";
import { AuthService } from "./auth.service";

const TEST_JWT_SECRET_VALUE = "tenant-isolation-secret-with-enough-entropy";
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

describe("AuthService tenant isolation", () => {
  it("scopes registration, login, lookups, preferences, sessions, and JWT principals by tenant", async () => {
    process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET_VALUE;
    const service = new AuthService(new InMemoryAuthUserStore());

    const tenantA = await service.register({
      tenantId: TENANT_A,
      email: "ada@example.com",
      password: "password123",
    });
    const tenantB = await service.register({
      tenantId: TENANT_B,
      email: "ada@example.com",
      password: "password123",
    });

    expect(tenantA.user.tenantId).toBe(TENANT_A);
    expect(tenantB.user.tenantId).toBe(TENANT_B);
    expect(tenantA.user.id).not.toBe(tenantB.user.id);

    await expect(
      service.login({
        tenantId: TENANT_A,
        email: "ada@example.com",
        password: "wrong-password",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.getUserById(tenantA.user.id, TENANT_B),
    ).resolves.toBeNull();

    const updated = await service.updateUserPreferences(
      tenantA.user.id,
      TENANT_A,
      { theme: "dark" },
    );
    expect(updated.tenantId).toBe(TENANT_A);
    expect(updated.theme).toBe("dark");
    await expect(
      service.updateUserPreferences(tenantA.user.id, TENANT_B, {
        theme: "light",
      }),
    ).rejects.toThrow("User was not found in tenant.");

    const principal = validateBearerAuthorization(
      `Bearer ${tenantA.accessToken}`,
      { AUTH_JWT_SECRET: TEST_JWT_SECRET_VALUE },
    );
    expect(principal).toMatchObject({
      subject: tenantA.user.id,
      tenantId: TENANT_A,
      email: "ada@example.com",
    });
  });
});
