import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AuthUserEntity, AuthUserEntitySchema } from "./auth-user.entity";

describe("AuthUserEntity", () => {
  it("constructs from explicit input", () => {
    expect(
      new AuthUserEntity({ email: "user@example.com", displayName: "User" }),
    ).toMatchObject({ email: "user@example.com", displayName: "User" });
  });

  it("defaults optional displayName to null", () => {
    expect(
      new AuthUserEntity({ email: "user@example.com" }).displayName,
    ).toBeNull();
  });

  it("can be constructed empty for MikroORM hydration", () => {
    expect(new AuthUserEntity()).toBeInstanceOf(AuthUserEntity);
  });

  it("registers table, primary key, and unique email metadata", () => {
    AuthUserEntitySchema.init();
    const metadata = AuthUserEntitySchema.meta;

    expect(metadata.tableName).toBe("auth_users");
    expect(metadata.properties.id.primary).toBe(true);
    expect(metadata.properties.id.type).toBe("uuid");
    expect(metadata.properties.email.name).toBe("email");
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
