import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveFullstackRuntime, resolveFullstackSelection, runFullstack } from "./fullstack.ts";
import { readConfiguredClosure } from "../../setup/closure-workspace.ts";

const validateFixtureClosure = async (workspaceRoot: string) => readConfiguredClosure(workspaceRoot);

function writeClosure(root: string, projects: string[], provider: "mongodb" | "postgres" | null): void {
  writeFileSync(
    join(root, ".nrb", "closure.json"),
    JSON.stringify({
      schemaVersion: 1,
      configHash: "a".repeat(64),
      graphDigest: "b".repeat(64),
      provider,
      roots: [...projects].sort(),
      projects: [...projects].sort(),
      targets: { serve: [...projects].sort() },
      productExternalPackages: {},
      toolingExternalPackages: {},
      services: [...projects].sort(),
      releaseImages: [...projects].sort(),
    }),
  );
}

describe("dev fullstack selection", () => {
  it("uses setup output when present", async () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    try {
      mkdirSync(join(root, ".nrb"));
      writeClosure(root, ["user-app", "user-app-api"], "postgres");
      assert.deepEqual(await resolveFullstackSelection(root, validateFixtureClosure), {
        projects: ["user-app", "user-app-api"],
        capabilities: ["postgres"],
        source: "setup",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires an explicit setup selection", async () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    try {
      await assert.rejects(resolveFullstackSelection(root), /closure.json is missing/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves the generated MongoDB environment over conflicting process values", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    try {
      mkdirSync(join(root, ".nrb"));
      writeFileSync(
        join(root, ".nrb", "capabilities.env"),
        [
          "NRB_CAPABILITIES=mongodb",
          "COMPOSE_PROFILES=mongodb,user-app-api",
          "DATABASE_ENGINE=mongodb",
          "AUTH_PERSISTENCE=mongodb",
          "MONGODB_URI=mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true",
          "MONGODB_DATABASE=nest_react_boilerplate",
          "MONGODB_REPLICA_SET=rs0",
          "",
        ].join("\n"),
      );
      const runtime = resolveFullstackRuntime(
        root,
        { projects: ["user-app-api"], capabilities: ["mongodb"], source: "setup" },
        { DATABASE_ENGINE: "postgres", AUTH_PERSISTENCE: "postgres" },
      );

      assert.equal(runtime.provider, "mongodb");
      assert.equal(runtime.environment.DATABASE_ENGINE, "mongodb");
      assert.equal(runtime.environment.AUTH_PERSISTENCE, "mongodb");
      assert.match(runtime.environment.MONGODB_URI ?? "", /replicaSet=rs0/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts, initializes, and migrates MongoDB before serving selected projects", async () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    const calls: Array<{ command: string; args: string[]; environment: NodeJS.ProcessEnv | undefined }> = [];
    try {
      mkdirSync(join(root, ".nrb"));
      writeClosure(root, ["user-app-api"], "mongodb");
      writeFileSync(
        join(root, ".nrb", "capabilities.env"),
        [
          "NRB_CAPABILITIES=mongodb",
          "COMPOSE_PROFILES=mongodb,user-app-api",
          "DATABASE_ENGINE=mongodb",
          "AUTH_PERSISTENCE=mongodb",
          "MONGODB_URI=mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true",
          "MONGODB_DATABASE=nest_react_boilerplate",
          "MONGODB_REPLICA_SET=rs0",
          "",
        ].join("\n"),
      );

      await runFullstack(
        root,
        async (command, args, options) => {
          calls.push({ command, args, environment: options?.env });
        },
        {},
        validateFixtureClosure,
      );

      assert.equal(calls.length, 4);
      assert.deepEqual(calls[0]?.args.slice(-3), ["up", "-d", "mongodb"]);
      assert.deepEqual(calls[1]?.args.slice(-3), ["run", "--rm", "mongodb-init"]);
      assert.deepEqual(calls[2]?.args, ["packages/tooling/bin/repo-tooling.mjs", "db", "migrate"]);
      assert.equal(calls[2]?.environment?.DATABASE_ENGINE, "mongodb");
      assert.equal(calls[3]?.command, "pnpm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves the PostgreSQL startup and migration path", async () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    const calls: Array<{ command: string; args: string[]; environment: NodeJS.ProcessEnv | undefined }> = [];
    try {
      mkdirSync(join(root, ".nrb"));
      writeClosure(root, ["user-app-api"], "postgres");
      writeFileSync(
        join(root, ".nrb", "capabilities.env"),
        [
          "NRB_CAPABILITIES=postgres",
          "COMPOSE_PROFILES=postgres,user-app-api",
          "DATABASE_ENGINE=postgres",
          "AUTH_PERSISTENCE=postgres",
          "DATABASE_URL=postgres://postgres:postgres@localhost:5432/nest_react_boilerplate",
          "CONTAINER_DATABASE_URL=postgres://postgres:postgres@postgres:5432/nest_react_boilerplate",
          "",
        ].join("\n"),
      );

      await runFullstack(
        root,
        async (command, args, options) => {
          calls.push({ command, args, environment: options?.env });
        },
        {},
        validateFixtureClosure,
      );

      assert.equal(calls.length, 3);
      assert.deepEqual(calls[0]?.args.slice(-4), ["up", "-d", "--wait", "postgres"]);
      assert.equal(calls[1]?.environment?.DATABASE_ENGINE, "postgres");
      assert.equal(calls[2]?.command, "pnpm");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
