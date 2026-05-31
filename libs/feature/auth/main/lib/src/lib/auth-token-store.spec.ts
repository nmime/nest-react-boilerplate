import { describe, expect, it } from "vitest";
import { InMemoryAuthTokenStore } from "./auth-token-store";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

describe("InMemoryAuthTokenStore", () => {
  it("rotates and revokes refresh tokens per tenant", async () => {
    const store = new InMemoryAuthTokenStore();
    const issued = await store.issueRefreshToken({
      tenantId: TENANT_A,
      userId: "user-1",
    });
    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      throw new Error(issued.error.message);
    }

    await expect(
      store.findRefreshToken(issued.value.token, TENANT_B),
    ).resolves.toMatchObject({
      value: null,
    });

    const rotated = await store.rotateRefreshToken(
      issued.value.token,
      TENANT_A,
    );
    expect(rotated.isOk()).toBe(true);
    if (rotated.isErr() || !rotated.value) {
      throw new Error("expected refresh rotation");
    }
    expect(rotated.value.token).not.toBe(issued.value.token);

    await expect(
      store.rotateRefreshToken(issued.value.token, TENANT_A),
    ).resolves.toMatchObject({
      value: null,
    });
    await expect(
      store.revokeRefreshToken(rotated.value.token, TENANT_A),
    ).resolves.toMatchObject({
      value: true,
    });
    await expect(
      store.findRefreshToken(rotated.value.token, TENANT_A),
    ).resolves.toMatchObject({
      value: null,
    });
  });

  it("consumes email verification and password reset tokens once", async () => {
    const store = new InMemoryAuthTokenStore();
    const issued = await store.issueUserActionToken({
      tenantId: TENANT_A,
      userId: "user-1",
      purpose: "password_reset",
    });
    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      throw new Error(issued.error.message);
    }

    await expect(
      store.consumeUserActionToken(
        issued.value.token,
        "email_verification",
        TENANT_A,
      ),
    ).resolves.toMatchObject({ value: null });
    const consumed = await store.consumeUserActionToken(
      issued.value.token,
      "password_reset",
      TENANT_A,
    );
    expect(consumed.isOk()).toBe(true);
    if (consumed.isErr() || !consumed.value) {
      throw new Error("expected consumable password reset token");
    }
    expect(consumed.value.userId).toBe("user-1");
    await expect(
      store.consumeUserActionToken(
        issued.value.token,
        "password_reset",
        TENANT_A,
      ),
    ).resolves.toMatchObject({ value: null });
  });
});
