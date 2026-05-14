import { describe, expect, it } from "vitest";
import { createPostgresDataSourceOptions } from "./data-source-options";
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresPort,
  DefaultPostgresUser,
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from "./database.config";

describe("Postgres data source options", () => {
  it("uses secure local defaults without synchronize", () => {
    expect(createPostgresDataSourceOptions({}, {})).toMatchObject({
      type: "postgres",
      host: DefaultPostgresHost,
      port: DefaultPostgresPort,
      username: DefaultPostgresUser,
      database: DefaultPostgresDatabase,
      synchronize: false,
      logging: false,
      ssl: false,
      entities: [],
      migrations: [],
    });
  });

  it("prefers DATABASE_URL when provided", () => {
    expect(
      createPostgresDataSourceOptions(
        {},
        { DATABASE_URL: "postgres://user:pass@db.example:5432/app" },
      ),
    ).toMatchObject({
      type: "postgres",
      url: "postgres://user:pass@db.example:5432/app",
      synchronize: false,
    });
  });

  it("reads POSTGRES_* values and SSL options", () => {
    expect(
      createPostgresDataSourceOptions(
        {},
        {
          POSTGRES_HOST: "db",
          POSTGRES_PORT: "15432",
          POSTGRES_USER: "app",
          POSTGRES_PASSWORD: "secret",
          POSTGRES_DB: "app_db",
          POSTGRES_SSL: "true",
          POSTGRES_SSL_REJECT_UNAUTHORIZED: "false",
          POSTGRES_SYNCHRONIZE: "yes",
          POSTGRES_LOGGING: "on",
        },
      ),
    ).toMatchObject({
      host: "db",
      port: 15432,
      username: "app",
      password: "secret",
      database: "app_db",
      ssl: { rejectUnauthorized: false },
      synchronize: true,
      logging: true,
    });
  });

  it("allows caller overrides while keeping postgres type", () => {
    expect(
      createPostgresDataSourceOptions(
        { database: "override", synchronize: true, type: "postgres" },
        { POSTGRES_DB: "env_db" },
      ),
    ).toMatchObject({
      database: "override",
      synchronize: true,
      type: "postgres",
    });
  });

  it("parses booleans and ports defensively", () => {
    expect(readBoolean(undefined)).toBeUndefined();
    expect(readBoolean("1")).toBe(true);
    expect(readBoolean("FALSE")).toBe(false);
    expect(readPort(undefined)).toBe(DefaultPostgresPort);
    expect(() => readPort("70000")).toThrow("Invalid POSTGRES_PORT: 70000");
    expect(() => readPort("not-a-number")).toThrow(
      "Invalid POSTGRES_PORT: not-a-number",
    );
    expect(readSslRejectUnauthorized({ POSTGRES_SSL: "true" })).toBe(true);
  });
});
