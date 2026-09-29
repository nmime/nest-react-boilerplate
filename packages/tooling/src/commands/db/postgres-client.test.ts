// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DefaultPostgresClientImage,
  createDockerInvocation,
  createLocalInvocation,
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
  it("reuses the exact PostgreSQL image already pulled by Compose", () => {
    const compose = readFileSync("docker/docker-compose.yml", "utf8");
    const postgresService = /(?:^|\n)  postgres:\n([\s\S]*?)(?=\n  [a-z][\w-]*:|\nvolumes:)/u.exec(compose)?.[1];
    const composeImage = /^    image:\s*([^\s#]+)/mu.exec(postgresService ?? "")?.[1];

    assert.equal(composeImage, DefaultPostgresClientImage);
  });

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
    assert.match(String(selected.warning), /Docker is unavailable/);
  });

  it("builds Docker commands without embedding database credentials in argv", () => {
    const invocation = createDockerInvocation({
      connectionString: databaseUrl,
      cwd: "/repo",
      image: "postgres:17.11-alpine",
      operation: "backup",
      outputPath: "test-results/dr/postgres.dump",
    });
    const commandLine = [invocation.command, ...invocation.args].join(" ");

    assert.match(commandLine, /postgres:17\.11-alpine/);
    assert.match(commandLine, /--env DATABASE_URL/);
    assert.match(commandLine, /\/backup\/postgres.dump/);
    assert.equal(commandLine.includes(new URL(databaseUrl).password), false);
    assert.equal(invocation.env.DATABASE_URL, databaseUrl);
  });

  it("maps absolute archives outside the repository and restores from a read-only mount", () => {
    for (const operation of ["backup", "restore"] as const) {
      const invocation = createDockerInvocation({
        connectionString: databaseUrl, cwd: "/repo", image: DefaultPostgresClientImage,
        operation, outputPath: "/tmp/audit archives/roundtrip.dump",
      });
      const volume = invocation.args[invocation.args.indexOf("--volume") + 1];
      assert.equal(volume, `/tmp/audit archives:/backup${operation === "restore" ? ":ro" : ""}`);
      assert.equal(invocation.args.at(-1), "/backup/roundtrip.dump");
      assert.ok(!invocation.args.includes("/repo:/workspace"));
      assert.ok(!invocation.args.some((argument) => argument.includes(new URL(databaseUrl).password)));
    }
  });

  it("resets the public schema before restoring partitioned tables", () => {
    const local = createLocalInvocation({
      connectionString: databaseUrl,
      operation: "restore",
      outputPath: "test-results/dr/postgres.dump",
    });
    const docker = createDockerInvocation({
      connectionString: databaseUrl,
      cwd: "/repo",
      image: "postgres:17.11-alpine",
      operation: "restore",
      outputPath: "test-results/dr/postgres.dump",
    });

    for (const invocation of [local, docker]) {
      const commandLine = [invocation.command, ...invocation.args].join(" ");
      assert.match(commandLine, /DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public/);
      assert.match(commandLine, /pg_restore --exit-on-error/);
      assert.doesNotMatch(commandLine, /pg_restore --clean/);
      assert.equal(commandLine.includes(new URL(databaseUrl).password), false);
      assert.equal(invocation.env.DATABASE_URL, databaseUrl);
    }
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
