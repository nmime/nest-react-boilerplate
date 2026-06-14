import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import {
  AuthUserEntity,
  DefaultAuthTenantId,
  type AuthUserEntityInput,
} from "../entity";
import { AuthUserRepository } from "./auth-user.repository";

function createEntityManagerMock() {
  const create = vi.fn((_, input: AuthUserEntityInput) => {
    const entity = new AuthUserEntity(input);
    entity.id = "user-id";
    return entity;
  });
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve<AuthUserEntity | null>(null));
  const entityManager = {
    create,
    persist,
    flush,
    findOne,
  } as unknown as EntityManager;

  return { create, persist, flush, findOne, entityManager };
}

describe("AuthUserRepository", () => {
  it("creates auth users through MikroORM", async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.createUser({
      email: "user@example.com",
      displayName: "User",
      permissions: ["profile:read"],
      roles: ["user"],
      locale: "ru",
    });

    const entity = result._unsafeUnwrap();
    expect(entity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(entity).toMatchObject({
      email: "user@example.com",
      displayName: "User",
      permissions: ["profile:read"],
      roles: ["user"],
      locale: "ru",
      theme: "system",
      status: "active",
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("finds an auth user by email", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findByEmail("user@example.com");

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthUserEntity, {
      tenantId: DefaultAuthTenantId,
      email: { $ne: null, $eq: "user@example.com" },
    });
  });

  it("returns null without querying for blank or null email", async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    await expect(
      authUsers.findByEmail(null).then((result) => result._unsafeUnwrap()),
    ).resolves.toBeNull();
    await expect(
      authUsers.findByEmail("   ").then((result) => result._unsafeUnwrap()),
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it("finds an auth user by id", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findById("user-id");

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthUserEntity, {
      id: "user-id",
      tenantId: DefaultAuthTenantId,
    });
  });

  it("lists and counts users with tenant-scoped allowlisted filters", async () => {
    const entity = new AuthUserEntity({ email: "admin@example.com" });
    const { entityManager } = createEntityManagerMock();
    const find = vi.fn(() => Promise.resolve([entity]));
    const count = vi.fn(() => Promise.resolve(1));
    Object.assign(entityManager, { find, count });
    const authUsers = new AuthUserRepository(entityManager);

    await expect(
      authUsers
        .listUsers({
          limit: 10,
          offset: 5,
          permission: "admin:users:read",
          role: "admin",
          search: "Ada_%",
          status: "active",
          tenantId: "tenant-id",
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toEqual([entity]);
    await expect(
      authUsers
        .countUsers({ role: "admin", tenantId: "tenant-id" })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(1);

    expect(find).toHaveBeenCalledWith(
      AuthUserEntity,
      {
        tenantId: "tenant-id",
        $or: [
          { email: { $ne: null, $ilike: "%Ada\\_\\%%" } },
          { displayName: { $ilike: "%Ada\\_\\%%" } },
        ],
        status: "active",
        roles: { $contains: ["admin"] },
        permissions: { $contains: ["admin:users:read"] },
      },
      { limit: 10, offset: 5, orderBy: { createdAt: "DESC" } },
    );
    expect(count).toHaveBeenCalledWith(AuthUserEntity, {
      tenantId: "tenant-id",
      roles: { $contains: ["admin"] },
    });
  });

  it("defensively caps and clamps pagination at repository level", async () => {
    const { entityManager } = createEntityManagerMock();
    const find = vi.fn(() => Promise.resolve([]));
    Object.assign(entityManager, { find });
    const authUsers = new AuthUserRepository(entityManager);

    await authUsers.listUsers({ limit: 1_000, offset: -10 });

    expect(find).toHaveBeenCalledWith(
      AuthUserEntity,
      { tenantId: DefaultAuthTenantId },
      { limit: 100, offset: 0, orderBy: { createdAt: "DESC" } },
    );
  });

  it("updates access policy fields", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setAccessPolicy("user-id", {
      permissions: ["admin:read"],
      roles: ["admin"],
      status: "disabled",
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      permissions: ["admin:read"],
      roles: ["admin"],
      status: "disabled",
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("keeps existing access policy fields when no policy fields are supplied", async () => {
    const entity = new AuthUserEntity({
      email: "user@example.com",
      permissions: ["profile:read"],
      roles: ["user"],
      status: "active",
    });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setAccessPolicy("user-id", {});

    expect(result._unsafeUnwrap()).toMatchObject({
      permissions: ["profile:read"],
      roles: ["user"],
      status: "active",
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("maps repository errors when updating access policy", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error("policy update failed"));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setAccessPolicy("user-id", {
      roles: ["admin"],
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "policy update failed",
    });
  });

  it("updates a persisted auth user locale", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setLocale("user-id", "ru");

    expect(result._unsafeUnwrap()).toMatchObject({ locale: "ru" });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("updates a persisted auth user theme", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setPreferences("user-id", { theme: "dark" });

    expect(result._unsafeUnwrap()).toMatchObject({ theme: "dark" });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("maps repository errors when updating locale", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error("locale update failed"));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setLocale("user-id", "ru");

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "locale update failed",
    });
  });

  it("maps repository errors when updating preferences", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error("preferences update failed"));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setPreferences("user-id", {
      theme: "light",
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "preferences update failed",
    });
  });

  it("maps repository errors when recording login", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error("login update failed"));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.recordLogin("user-id");

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "login update failed",
    });
  });

  it("records last login time", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const loggedInAt = new Date("2026-01-01T00:00:00.000Z");
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.recordLogin("user-id", loggedInAt);

    expect(result._unsafeUnwrap()?.lastLoginAt).toBe(loggedInAt);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("returns null when an email or id is unknown", async () => {
    const { entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    expect(
      (await authUsers.findByEmail("missing@example.com"))._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.findById("00000000-0000-4000-8000-000000000000")
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.setAccessPolicy(
          "00000000-0000-4000-8000-000000000000",
          {},
        )
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.setLocale("00000000-0000-4000-8000-000000000000", "ru")
      )._unsafeUnwrap(),
    ).toBeNull();
    expect(
      (
        await authUsers.recordLogin("00000000-0000-4000-8000-000000000000")
      )._unsafeUnwrap(),
    ).toBeNull();
  });

  it("maps repository errors when creating users", async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue(new Error("duplicate email"));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.createUser({ email: "user@example.com" });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "duplicate email",
    });
  });

  it("maps non-error repository failures", async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue("database unavailable");
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findByEmail("user@example.com");

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "Auth user repository failed.",
    });
  });
});
