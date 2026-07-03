import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateBearerAuthorization } from "@app/backend-feature-auth-shared";
import { InMemoryAuthUserStore } from "./auth-user-store";
import { AuthService } from "./auth.service";

const testJwtSecretValue = "tenant-isolation-secret-with-enough-entropy";
const tenantAId = "11111111-1111-4111-8111-111111111111";
const tenantBId = "22222222-2222-4222-8222-222222222222";

describe("AuthService tenant isolation", () => {
  it("scopes registration, login, lookups, preferences, sessions, and JWT principals by tenant", async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const service = new AuthService(new InMemoryAuthUserStore());

    const tenantASession = await service.register({
      tenantId: tenantAId,
      email: "ada@example.com",
      password: "password123",
    });
    const tenantBSession = await service.register({
      tenantId: tenantBId,
      email: "ada@example.com",
      password: "password123",
    });

    expect(tenantASession.user.tenantId).toBe(tenantAId);
    expect(tenantBSession.user.tenantId).toBe(tenantBId);
    expect(tenantASession.user.id).not.toBe(tenantBSession.user.id);

    await expect(
      service.login({
        tenantId: tenantAId,
        email: "ada@example.com",
        password: "wrong-password",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.getUserById(tenantASession.user.id, tenantBId),
    ).resolves.toBeNull();

    const updated = await service.updateUserPreferences(
      tenantASession.user.id,
      tenantAId,
      { theme: "dark" },
    );
    expect(updated.tenantId).toBe(tenantAId);
    expect(updated.theme).toBe("dark");
    await expect(
      service.updateUserPreferences(tenantASession.user.id, tenantBId, {
        theme: "light",
      }),
    ).rejects.toThrow("User was not found in tenant.");

    const principal = validateBearerAuthorization(
      `Bearer ${tenantASession.accessToken}`,
      { AUTH_JWT_SECRET: testJwtSecretValue },
    );
    expect(principal).toMatchObject({
      subject: tenantASession.user.id,
      tenantId: tenantAId,
      email: "ada@example.com",
    });
  });
});
