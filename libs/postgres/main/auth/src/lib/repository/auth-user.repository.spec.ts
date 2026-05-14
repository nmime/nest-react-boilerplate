import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import { AuthUserEntity, type AuthUserEntityInput } from "../entity";
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
    });

    const entity = result._unsafeUnwrap();
    expect(entity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(entity).toMatchObject({
      email: "user@example.com",
      displayName: "User",
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
      email: "user@example.com",
    });
  });

  it("returns null when an email is unknown", async () => {
    const { entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findByEmail("missing@example.com");

    expect(result._unsafeUnwrap()).toBeNull();
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
