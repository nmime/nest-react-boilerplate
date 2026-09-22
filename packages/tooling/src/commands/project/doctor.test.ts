// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { plan } from "../../setup/planner.ts";
import { parseNrbConfig, schemaVersion } from "../../setup/schema.ts";
import { buildState, hashString } from "../../setup/state.ts";
import {
  checkCapabilityActivation,
  checkComposeSelection,
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

  it("accepts the exact pinned pnpm version", () => {
    assert.equal(checkPnpmVersion("11.15.1").status, "pass");
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
          schemaVersion: "2.0.0",
          identity: {
            name: "Nest React Boilerplate",
            slug: "nest-react-boilerplate",
            packageName: "nest-react-boilerplate",
            dbName: "nest_react_boilerplate",
            className: "NestReactBoilerplate",
            owner: "your-github-org",
            domain: "example.com",
            apexApp: "landing-app",
            aliasPrefix: "@app",
            toolingScope: "@repo",
            brand: {
              cliBin: "nrb",
              stateDir: ".nrb",
              envPrefix: "NRB",
              imagePrefix: "nrb",
              imageTag: "local",
              redisKeyPrefix: "nrb:",
              helmChart: "nest-react-boilerplate",
              helmRelease: "nest-react-boilerplate",
              natsClientName: "nest-react-boilerplate-local",
              s3Bucket: "nest-react-boilerplate",
            },
          },
          appRenames: {},
          apps: ["landing-app"],
          capabilities: [],
          product: { ciMode: "product", frontendApiMode: "same-origin", mobileTargets: ["web"] },
          deployment: {
            targets: ["docker"],
            publicDomain: "example.com",
            primaryApp: "landing-app",
            publicTopology: "single-domain",
            kubernetesDelivery: "direct",
            infrastructure: { redis: "bundled", nats: "bundled", s3: "bundled" },
            imageRegistry: "ghcr.io/your-github-org/nest-react-boilerplate",
          },
          runtime: {
            ports: {
              "admin-app-api": 3001,
              "user-app-api": 3002,
              "auth-app-api": 3003,
              "discord-app-api": 3007,
              "telegram-bot-api": 3013,
              "admin-app": 4200,
              "user-app": 4201,
              "landing-app": 4202,
              "site-app": 4203,
              "mobile-app": 4300,
              postgres: 5432,
              redis: 6379,
              mongodb: 27017,
              nats: 4222,
              "nats-monitor": 8222,
              minio: 9000,
              "minio-console": 9001,
              "otlp-grpc": 4317,
              "otlp-http": 4318,
              edge: 8080,
              grafana: 3000,
              prometheus: 9090,
              loki: 3100,
              tempo: 3200,
            },
            stagingOffset: 100,
            containerPort: 80,
            postgres: { user: "postgres", password: "postgres" },
            minio: { accessKey: "minioadmin", secretKey: "minioadmin" },
            localSecrets: {
              session: "local-session-secret-change-me-32-chars",
              betterAuth: "local-better-auth-secret-change-me-32-chars",
              discordCustomId: "local-discord-custom-id-secret",
            },
          },
          session: {
            cookieNameDev: "nrb.sid",
            cookieNameProd: "__Host-nrb.sid",
            maxAgeSeconds: 604800,
            sameSite: "lax",
            secure: true,
          },
          tenant: {
            defaultTenantId: "00000000-0000-0000-0000-000000000000",
            seed: {
              admin: { name: "Alice Administrator", email: "admin@example.com", password: "ChangeMe123!" },
              users: [
                { name: "Bob User", email: "bob.user@example.com", password: "Bob@User456!" },
                { name: "Charlie Dev", email: "charlie.dev@example.com", password: "Charlie@Dev789!" },
              ],
            },
          },
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
        "services:\n  landing-app:\n    image: scratch\n    profiles: [landing-app]\n    environment:\n      NRB_CLOSURE_CONTEXT: ${NRB_CLOSURE_CONTEXT:?missing closure context}\n",
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
