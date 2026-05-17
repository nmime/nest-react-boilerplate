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
        locale: "es",
        roles: ["user"],
        status: "invited",
      }),
    ).toMatchObject({
      email: "user@example.com",
      displayName: "User",
      passwordHash: "hashed",
      permissions: ["profile:read"],
      roles: ["user"],
      locale: "es",
      status: "invited",
    });
  });

  it("defaults optional enterprise access fields", () => {
    const entity = new AuthUserEntity({ email: "user@example.com" });

    expect(entity.displayName).toBeNull();
    expect(entity.passwordHash).toBe("");
    expect(entity.status).toBe("active");
    expect(entity.roles).toEqual([]);
    expect(entity.permissions).toEqual([]);
    expect(entity.locale).toBeNull();
    expect(entity.lastLoginAt).toBeNull();
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
    expect(metadata.properties.locale.nullable).toBe(true);
    expect(metadata.properties.lastLoginAt.nullable).toBe(true);
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "auth_users_email_key",
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
