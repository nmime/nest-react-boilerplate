import { Migrator } from "@mikro-orm/migrations";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createPostgresMikroOrmOptions } from "./data-source-options";
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresPort,
  DefaultPostgresUser,
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from "./database.config";

describe("Postgres MikroORM options", () => {
  it("uses secure local defaults without automatic schema sync", () => {
    expect(createPostgresMikroOrmOptions({}, {})).toMatchObject({
      driver: PostgreSqlDriver,
      host: DefaultPostgresHost,
      port: DefaultPostgresPort,
      user: DefaultPostgresUser,
      dbName: DefaultPostgresDatabase,
      debug: false,
      driverOptions: {},
      entities: [],
      extensions: [Migrator],
      autoLoadEntities: true,
    });
  });

  it("prefers DATABASE_URL when provided", () => {
    expect(
      createPostgresMikroOrmOptions(
        {},
        { DATABASE_URL: "postgres://user:pass@db.example:5432/app" },
      ),
    ).toMatchObject({
      driver: PostgreSqlDriver,
      clientUrl: "postgres://user:pass@db.example:5432/app",
      debug: false,
    });
  });

  it("reads POSTGRES_* values and SSL options", () => {
    expect(
      createPostgresMikroOrmOptions(
        {},
        {
          POSTGRES_HOST: "db",
          POSTGRES_PORT: "15432",
          POSTGRES_USER: "app",
          POSTGRES_PASSWORD: "secret",
          POSTGRES_DB: "app_db",
          POSTGRES_SSL: "true",
          POSTGRES_SSL_REJECT_UNAUTHORIZED: "false",
          POSTGRES_LOGGING: "on",
        },
      ),
    ).toMatchObject({
      host: "db",
      port: 15432,
      user: "app",
      password: "secret",
      dbName: "app_db",
      driverOptions: {
        connection: { ssl: { rejectUnauthorized: false } },
      },
      debug: true,
    });
  });

  it("allows caller overrides while keeping the PostgreSQL driver", () => {
    expect(
      createPostgresMikroOrmOptions(
        { dbName: "override", debug: true, entities: ["./dist/entities"] },
        { POSTGRES_DB: "env_db" },
      ),
    ).toMatchObject({
      dbName: "override",
      debug: true,
      entities: ["./dist/entities"],
      driver: PostgreSqlDriver,
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
