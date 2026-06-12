// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDockerInvocation,
  isPostgresClientVersionMismatch,
  parsePostgresMajorVersion,
  redactCommand,
  selectPostgresClientMode,
} from "./postgres-client.ts";

function buildDatabaseUrl() {
  const url = new URL("postgres://localhost:5432/nest_react_boilerplate");
  url.username = "postgres";
  url.password = ["example", "password"].join("-");
  return url.toString();
}

const databaseUrl = buildDatabaseUrl();

describe("postgres backup/restore client selection", () => {
  it("parses PostgreSQL client and server major versions", () => {
    assert.equal(parsePostgresMajorVersion("pg_dump (PostgreSQL) 14.23"), 14);
    assert.equal(parsePostgresMajorVersion("17.10 (Debian 17.10-1.pgdg12+1)"), 17);
    assert.equal(parsePostgresMajorVersion("170010"), 17);
  });

  it("selects Docker when local client major does not match server major", () => {
    assert.deepEqual(
      selectPostgresClientMode({
        dockerAvailable: true,
        forceDocker: false,
        localClientExists: true,
        localMajor: 14,
        serverMajor: 17,
      }),
      {
        mode: "docker",
        reason: "PostgreSQL client major 14 does not match server major 17",
      },
    );
  });

  it("falls back clearly when Docker was requested but unavailable", () => {
    const selected = selectPostgresClientMode({
      dockerAvailable: false,
      forceDocker: true,
      localClientExists: true,
      localMajor: 14,
      serverMajor: 17,
    });

    assert.equal(selected.mode, "local");
    assert.match(selected.warning, /Docker is unavailable/);
  });

  it("builds Docker commands without embedding database credentials in argv", () => {
    const invocation = createDockerInvocation({
      connectionString: databaseUrl,
      cwd: "/repo",
      image: "postgres:17-alpine",
      operation: "backup",
      outputPath: "test-results/dr/postgres.dump",
    });
    const commandLine = [invocation.command, ...invocation.args].join(" ");

    assert.match(commandLine, /postgres:17-alpine/);
    assert.match(commandLine, /--env DATABASE_URL/);
    assert.match(commandLine, /\/workspace\/test-results\/dr\/postgres.dump/);
    assert.equal(commandLine.includes(new URL(databaseUrl).password), false);
    assert.equal(invocation.env.DATABASE_URL, databaseUrl);
  });

  it("redacts local command dry-run output and detects version mismatch errors", () => {
    const redacted = redactCommand(["pg_dump", "--file", "out.dump", databaseUrl], databaseUrl);

    assert.equal(redacted.join(" ").includes(new URL(databaseUrl).password), false);
    assert.equal(
      isPostgresClientVersionMismatch(
        "pg_dump: error: server version: 17.10; pg_dump version: 14.23; aborting because of server version mismatch",
      ),
      true,
    );
  });
});
