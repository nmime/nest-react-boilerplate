import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { validateBearerAuthorization } from "@app/features-auth-oauth";
import { InMemoryAuthUserStore } from "./auth-user-store";
import {
  AuthService,
  hashPassword,
  normalizeEmail,
  signJwt,
  verifyPassword,
} from "./auth.service";

describe("AuthService", () => {
  it("registers, logs in, records sessions, and signs verifiable JWTs", async () => {
    process.env.AUTH_JWT_SECRET = "unit-test-secret";
    const service = new AuthService(new InMemoryAuthUserStore());

    const registered = await service.register({
      email: "User@Example.com",
      password: "password123",
      displayName: "User",
    });

    expect(registered.user).toMatchObject({
      email: "user@example.com",
      displayName: "User",
      roles: ["user"],
      permissions: ["profile:read"],
    });
    expect(registered.tokenType).toBe("Bearer");
    expect(
      validateBearerAuthorization(`Bearer ${registered.accessToken}`, {
        AUTH_JWT_SECRET: "unit-test-secret",
      }).subject,
    ).toBe(registered.user.id);

    const loggedIn = await service.login({
      email: "user@example.com",
      password: "password123",
    });
    expect(loggedIn.user.id).toBe(registered.user.id);
    await expect(
      service.getUserById(registered.user.id),
    ).resolves.toMatchObject({
      email: "user@example.com",
    });
    await expect(service.getUserById("missing")).resolves.toBeNull();
  });

  it("rejects duplicate registrations and invalid credentials", async () => {
    process.env.AUTH_JWT_SECRET = "unit-test-secret";
    const service = new AuthService(new InMemoryAuthUserStore());
    await service.register({ email: "a@example.com", password: "password123" });

    await expect(
      service.register({ email: "a@example.com", password: "password123" }),
    ).rejects.toThrow("Email is already registered");
    await expect(
      service.login({ email: "a@example.com", password: "wrongpass" }),
    ).rejects.toThrow("Invalid email or password");
  });

  it("maps store failures, inactive users, and fallback login records", async () => {
    process.env.AUTH_JWT_SECRET = "unit-test-secret";
    const failingStore = {
      findByEmail: () =>
        errAsync({ code: "repository_error" as const, message: "find failed" }),
      create: () =>
        errAsync({
          code: "repository_error" as const,
          message: "create failed",
        }),
      findById: () =>
        errAsync({ code: "repository_error" as const, message: "id failed" }),
      recordLogin: () => okAsync(null),
    };
    const serviceWithFindFailure = new AuthService(failingStore);
    await expect(
      serviceWithFindFailure.register({
        email: "err@example.com",
        password: "password123",
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWithFindFailure.login({
        email: "err@example.com",
        password: "password123",
      }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(serviceWithFindFailure.getUserById("id")).resolves.toBeNull();

    const creatingFailureStore = {
      ...failingStore,
      findByEmail: () => okAsync(null),
    };
    await expect(
      new AuthService(creatingFailureStore as never).register({
        email: "err@example.com",
        password: "password123",
      }),
    ).rejects.toThrow("create failed");

    const inactiveHash = hashPassword("password123", "inactive-salt");
    const inactiveStore = {
      findByEmail: () =>
        okAsync({
          id: "disabled-id",
          email: "disabled@example.com",
          displayName: null,
          passwordHash: inactiveHash,
          roles: ["user"],
          permissions: ["profile:read"],
          status: "disabled" as const,
          lastLoginAt: null,
        }),
      create: () => okAsync(null),
      findById: () => okAsync(null),
      recordLogin: () => okAsync(null),
    };
    await expect(
      new AuthService(inactiveStore as never).login({
        email: "disabled@example.com",
        password: "password123",
      }),
    ).rejects.toThrow("User is not active");

    const activeHash = hashPassword("password123", "active-salt");
    const activeRecord = {
      id: "active-id",
      email: "active@example.com",
      displayName: null,
      passwordHash: activeHash,
      roles: ["user"],
      permissions: ["profile:read"],
      status: "active" as const,
      lastLoginAt: null,
    };
    const fallbackLogin = await new AuthService({
      findByEmail: () => okAsync(activeRecord),
      create: () => okAsync(activeRecord),
      findById: () => okAsync(activeRecord),
      recordLogin: () => okAsync(null),
    }).login({ email: "active@example.com", password: "password123" });
    expect(fallbackLogin.user.id).toBe("active-id");
  });

  it("signs optional issuer/audience and falls back invalid expiry", () => {
    const token = signJwt(
      { sub: "user" },
      {
        AUTH_JWT_SECRET: "unit-test-secret",
        AUTH_JWT_ISSUER: "issuer",
        AUTH_JWT_AUDIENCE: "audience",
      },
      60,
    );
    expect(token.split(".")).toHaveLength(3);

    const service = new AuthService(new InMemoryAuthUserStore());
    const baseUser = {
      id: "id",
      email: "user@example.com",
      displayName: null,
      passwordHash: "hash",
      roles: [],
      permissions: [],
      status: "active" as const,
      lastLoginAt: null,
    };
    expect(
      service.createSession(baseUser, {
        AUTH_JWT_SECRET: "unit-test-secret",
        AUTH_JWT_EXPIRES_IN_SECONDS: "60",
      }).expiresIn,
    ).toBe(60);

    const session = service.createSession(
      {
        id: "id",
        email: "user@example.com",
        displayName: null,
        passwordHash: "hash",
        roles: [],
        permissions: [],
        status: "active",
        lastLoginAt: null,
      },
      {
        AUTH_JWT_SECRET: "unit-test-secret",
        AUTH_JWT_EXPIRES_IN_SECONDS: "bad",
      },
    );
    expect(session.expiresIn).toBe(3600);
    expect(
      service.createSession(
        {
          id: "id",
          email: "user@example.com",
          displayName: null,
          passwordHash: "hash",
          roles: [],
          permissions: [],
          status: "active",
          lastLoginAt: null,
        },
        {
          AUTH_JWT_SECRET: "unit-test-secret",
          AUTH_JWT_EXPIRES_IN_SECONDS: "0",
        },
      ).expiresIn,
    ).toBe(3600);
  });

  it("normalizes email, hashes passwords, and requires JWT secret", () => {
    const encoded = hashPassword("password123", "fixed-salt");
    expect(normalizeEmail(" USER@EXAMPLE.COM ")).toBe("user@example.com");
    expect(verifyPassword("password123", encoded)).toBe(true);
    expect(verifyPassword("wrongpass", encoded)).toBe(false);
    expect(verifyPassword("password123", "bad-format")).toBe(false);
    expect(() => signJwt({ sub: "user" }, {}, 60)).toThrow(
      UnauthorizedException,
    );
  });
});
