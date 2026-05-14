import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { DataSource } from "typeorm";
import { AuthUserEntity } from "./auth-user.entity";

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

  it("can be constructed empty for TypeORM hydration", () => {
    expect(new AuthUserEntity()).toBeInstanceOf(AuthUserEntity);
  });

  it("registers table and unique email metadata", async () => {
    const dataSource = new DataSource({
      type: "postgres",
      entities: [AuthUserEntity],
    });

    await dataSource.buildMetadatas();

    const metadata = dataSource.getMetadata(AuthUserEntity);

    expect(metadata.tableName).toBe("auth_users");
    expect(metadata.indices.some((index) => index.isUnique)).toBe(true);
    expect(
      metadata.columns.some((column) => column.propertyName === "email"),
    ).toBe(true);
  });
});
