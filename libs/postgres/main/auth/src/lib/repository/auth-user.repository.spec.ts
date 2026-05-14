import { describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import { AuthUserEntity, type AuthUserEntityInput } from "../entity";
import { AuthUserRepository } from "./auth-user.repository";

function createRepositoryMock() {
  const create = vi.fn(
    (input: AuthUserEntityInput) => new AuthUserEntity(input),
  );
  const save = vi.fn((entity: AuthUserEntity) =>
    Promise.resolve(Object.assign(entity, { id: "user-id" })),
  );
  const findOne = vi.fn(() => Promise.resolve<AuthUserEntity | null>(null));
  const repository = {
    create,
    save,
    findOne,
  } as unknown as Repository<AuthUserEntity>;

  return { create, save, findOne, repository };
}

describe("AuthUserRepository", () => {
  it("creates auth users through TypeORM", async () => {
    const { create, repository } = createRepositoryMock();
    const authUsers = new AuthUserRepository(repository);

    const result = await authUsers.createUser({
      email: "user@example.com",
      displayName: "User",
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      id: "user-id",
      email: "user@example.com",
      displayName: "User",
    });
    expect(create).toHaveBeenCalledWith({
      email: "user@example.com",
      displayName: "User",
    });
  });

  it("finds an auth user by email", async () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });
    const { findOne, repository } = createRepositoryMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(repository);

    const result = await authUsers.findByEmail("user@example.com");

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("returns null when an email is unknown", async () => {
    const { repository } = createRepositoryMock();
    const authUsers = new AuthUserRepository(repository);

    const result = await authUsers.findByEmail("missing@example.com");

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it("maps repository errors when creating users", async () => {
    const { save, repository } = createRepositoryMock();
    save.mockRejectedValue(new Error("duplicate email"));
    const authUsers = new AuthUserRepository(repository);

    const result = await authUsers.createUser({ email: "user@example.com" });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "duplicate email",
    });
  });

  it("maps non-error repository failures", async () => {
    const { findOne, repository } = createRepositoryMock();
    findOne.mockRejectedValue("database unavailable");
    const authUsers = new AuthUserRepository(repository);

    const result = await authUsers.findByEmail("user@example.com");

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "repository_error",
      message: "Auth user repository failed.",
    });
  });
});
