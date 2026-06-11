import { describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import {
  hashOpaqueToken,
  InMemoryAuthTokenStore,
  PostgresAuthTokenStore,
} from "./auth-token-store";

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

describe("PostgresAuthTokenStore", () => {
  it("persists only token hashes for refresh and user action tokens", async () => {
    const repository = {
      createRefreshToken: vi.fn(() => okAsync({})),
      createUserToken: vi.fn(() => okAsync({})),
    };
    const store = new PostgresAuthTokenStore(repository as never);

    const refresh = await store.issueRefreshToken({
      tenantId: TENANT_A,
      userId: "user-1",
    });
    const action = await store.issueUserActionToken({
      tenantId: TENANT_A,
      userId: "user-1",
      purpose: "password_reset",
    });

    expect(refresh.isOk()).toBe(true);
    expect(action.isOk()).toBe(true);
    if (refresh.isErr() || action.isErr()) {
      throw new Error("expected issued postgres tokens");
    }

    expect(repository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        userId: "user-1",
        tokenHash: hashOpaqueToken(refresh.value.token),
      }),
    );
    expect(repository.createUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        userId: "user-1",
        purpose: "password_reset",
        tokenHash: hashOpaqueToken(action.value.token),
      }),
    );
    expect(
      JSON.stringify(repository.createRefreshToken.mock.calls),
    ).not.toContain(refresh.value.token);
    expect(JSON.stringify(repository.createUserToken.mock.calls)).not.toContain(
      action.value.token,
    );
  });
});
