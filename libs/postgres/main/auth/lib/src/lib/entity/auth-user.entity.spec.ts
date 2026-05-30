import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AuthUserEntity, AuthUserEntitySchema } from "./auth-user.entity";

describe("AuthUserEntity", () => {
  it("constructs from explicit input", () => {
    expect(
      new AuthUserEntity({
        email: "user@example.com",
        displayName: "User",
        permissions: ["profile:read"],
        passwordHash: "hashed",
        locale: "ru",
        theme: "dark",
        roles: ["user"],
        status: "invited",
      }),
    ).toMatchObject({
      email: "user@example.com",
      displayName: "User",
      passwordHash: "hashed",
      permissions: ["profile:read"],
      roles: ["user"],
      locale: "ru",
      theme: "dark",
      status: "invited",
    });
  });

  it("defaults optional enterprise access fields", () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });

    expect(entity.displayName).toBe("");
    expect(entity.passwordHash).toBe("");
    expect(entity.status).toBe("active");
    expect(entity.roles).toEqual([]);
    expect(entity.permissions).toEqual([]);
    expect(entity.locale).toBe("en");
    expect(entity.theme).toBe("system");
    expect(entity.lastLoginAt).toEqual(new Date(0));
  });

  it("can be constructed empty for MikroORM hydration", () => {
    expect(new AuthUserEntity()).toBeInstanceOf(AuthUserEntity);
  });

  it("registers table, primary key, unique email, and access metadata", () => {
    AuthUserEntitySchema.init();
    const metadata = AuthUserEntitySchema.meta;

    expect(metadata.tableName).toBe("auth_users");
    expect(metadata.properties.id.primary).toBe(true);
    expect(metadata.properties.id.type).toBe("uuid");
    expect(metadata.properties.email.name).toBe("email");
    expect(metadata.properties.passwordHash.fieldNames).toContain(
      "password_hash",
    );
    expect(metadata.properties.status.type).toBe("varchar");
    expect(metadata.properties.roles.type).toBe("json");
    expect(metadata.properties.permissions.type).toBe("json");
    expect(metadata.properties.locale.length).toBe(16);
    expect(metadata.properties.locale.nullable).not.toBe(true);
    expect(metadata.properties.theme.length).toBe(16);
    expect(metadata.properties.theme.default).toBe("system");
    expect(metadata.properties.theme.nullable).not.toBe(true);
    expect(metadata.properties.lastLoginAt.nullable).not.toBe(true);
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_users__email",
        properties: ["email"],
      }),
    );
  });

  it("defines timestamp lifecycle hooks", () => {
    AuthUserEntitySchema.init();

    expect(
      AuthUserEntitySchema.meta.properties.createdAt.onCreate?.(),
    ).toBeInstanceOf(Date);
    expect(
      AuthUserEntitySchema.meta.properties.updatedAt.onCreate?.(),
    ).toBeInstanceOf(Date);
    expect(
      AuthUserEntitySchema.meta.properties.updatedAt.onUpdate?.(),
    ).toBeInstanceOf(Date);
  });
});
