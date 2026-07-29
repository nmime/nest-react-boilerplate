import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { plan } from "../../setup/planner.ts";
import { parseNrbConfig, schemaVersion } from "../../setup/schema.ts";
import { buildState, hashString } from "../../setup/state.ts";
import {
  checkBunVersion,
  checkCapabilityActivation,
  checkComposeSelection,
  checkJavaScriptRuntime,
  checkNodeVersion,
  checkNrbState,
  checkPnpmVersion,
} from "./doctor.ts";

describe("project doctor runtime policy", () => {
  it("accepts Node 24 and rejects releases outside the supported major", () => {
    assert.equal(checkNodeVersion("v24.0.0").status, "pass");
    assert.equal(checkNodeVersion("v24.18.0").status, "pass");
    assert.equal(checkNodeVersion("v25.0.0").status, "fail");
    assert.equal(checkNodeVersion("v23.11.0").status, "fail");
    assert.equal(checkNodeVersion("invalid").status, "fail");
  });

  it("identifies the pinned Bun runtime instead of its Node compatibility version", () => {
    assert.deepEqual(checkJavaScriptRuntime({ name: "bun", version: "1.3.14", nodeCompatibilityVersion: "24.3.0" }), {
      name: "runtime-version",
      status: "pass",
      message: "Bun 1.3.14",
    });
    assert.equal(checkBunVersion("1.3.13").status, "fail");
  });

  it("accepts the exact pinned pnpm version", () => {
    assert.equal(checkPnpmVersion("11.11.0").status, "pass");
    assert.equal(checkPnpmVersion("11.12.0").status, "fail");
  });

  it("rejects malformed state and detects generated-file drift", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-doctor-state-"));
    const stateDirectory = join(workspaceRoot, ".nrb");
    mkdirSync(stateDirectory);

    try {
      writeFileSync(join(stateDirectory, "state.json"), JSON.stringify({ version: 1, files: {} }));
      assert.equal(checkNrbState(workspaceRoot).status, "warn");

      const trackedPath = ".nrb/workspace.json";
      writeFileSync(join(workspaceRoot, trackedPath), "expected\n");
      const state = buildState(hashString("config"), { [trackedPath]: hashString("expected\n") });
      writeFileSync(join(stateDirectory, "state.json"), JSON.stringify(state));
      assert.equal(checkNrbState(workspaceRoot).status, "pass");

      writeFileSync(join(workspaceRoot, trackedPath), "manually changed\n");
      const drifted = checkNrbState(workspaceRoot);
      assert.equal(drifted.status, "fail");
      assert.match(drifted.message, /workspace\.json/u);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("accepts provider-free Compose selections and rejects mixed database providers", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-doctor-compose-"));
    const stateDirectory = join(workspaceRoot, ".nrb");
    const dockerDirectory = join(workspaceRoot, "docker");
    mkdirSync(stateDirectory);
    mkdirSync(dockerDirectory);

    try {
      writeFileSync(
        join(workspaceRoot, "nrb.config.json"),
        JSON.stringify({
          schemaVersion: "1.0.0",
          apps: ["landing-app"],
          capabilities: [],
          options: { prune: false, force: false, dryRun: false, nonInteractive: true },
        }),
      );
      writeFileSync(
        join(stateDirectory, "closure.json"),
        JSON.stringify({
          schemaVersion: 1,
          configHash: "a".repeat(64),
          graphDigest: "b".repeat(64),
          provider: null,
          roots: ["landing-app"],
          projects: ["landing-app"],
          targets: { build: ["landing-app"] },
          productExternalPackages: {},
          toolingExternalPackages: {},
          services: ["landing-app"],
          releaseImages: ["landing-app"],
        }),
      );
      writeFileSync(
        join(dockerDirectory, "docker-compose.yml"),
        "services:\n  landing-app:\n    image: scratch\n    profiles: [landing-app]\n",
      );
      writeFileSync(
        join(stateDirectory, "capabilities.env"),
        "NRB_APPS=landing-app\nNRB_CAPABILITIES=\nCOMPOSE_PROFILES=landing-app\nDATABASE_ENGINE=\nAUTH_PERSISTENCE=\n",
      );
      const neither = checkComposeSelection(workspaceRoot);
      assert.notEqual(neither.status, "fail");
      assert.match(neither.message, /provider-free/u);

      writeFileSync(
        join(stateDirectory, "capabilities.env"),
        "NRB_APPS=landing-app\nNRB_CAPABILITIES=mongodb,postgres\nCOMPOSE_PROFILES=mongodb,postgres\nDATABASE_ENGINE=mongodb\nAUTH_PERSISTENCE=mongodb\n",
      );
      const both = checkComposeSelection(workspaceRoot);
      assert.equal(both.status, "fail");
      assert.match(both.message, /NRB_CAPABILITIES is stale/u);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("detects opposite-provider drift in generated backend composition", () => {
    for (const provider of ["postgres", "mongodb"] as const) {
      const workspaceRoot = mkdtempSync(join(tmpdir(), `nrb-doctor-${provider}-`));
      try {
        const config = parseNrbConfig({
          schemaVersion,
          apps: ["user-app-api"],
          capabilities: [provider],
        });
        for (const operation of plan(config).operations) {
          if (operation.kind !== "create_file" && operation.kind !== "update_file") continue;
          const path = join(workspaceRoot, operation.path);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, operation.content);
        }

        assert.equal(checkCapabilityActivation(workspaceRoot).status, "pass");

        const generatedPath = join(
          workspaceRoot,
          "apps/backend/user/user-app-api/src/capabilities.generated.ts",
        );
        const selectedName = provider === "postgres" ? "PostgresMainModule" : "MongoMainModule";
        const oppositeName = provider === "postgres" ? "MongoMainModule" : "PostgresMainModule";
        const generated = readFileSync(generatedPath, "utf8");
        writeFileSync(generatedPath, generated.replace(selectedName, oppositeName));

        const drifted = checkCapabilityActivation(workspaceRoot);
        assert.equal(drifted.status, "fail");
        assert.match(drifted.message, /user-app-api\/src\/capabilities\.generated\.ts/u);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }
  });
});
