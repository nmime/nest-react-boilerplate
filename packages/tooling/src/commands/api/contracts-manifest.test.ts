// @ts-nocheck
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { describe, it } from "node:test";
import { apiContractsManifestPath, loadApiContractsManifest } from "./contracts-manifest.ts";

describe("api contracts manifest", () => {
  it("keeps live JSON artifacts inside owning app contract directories", () => {
    const manifest = loadApiContractsManifest();
    assert.deepEqual(
      manifest.openapi.map((contract) => contract.artifactPath),
      [
        "apps/backend/auth-app-api/contracts/openapi/auth-app-api.json",
        "apps/backend/user-app-api/contracts/openapi/user-app-api.json",
        "apps/backend/admin-app-api/contracts/openapi/admin-app-api.json",
      ],
    );
    assert.deepEqual(
      manifest.consumers.map((contract) => contract.artifactPath),
      ["apps/frontend/app/contracts/consumers/frontend-auth.pact.json"],
    );
    assert.equal(
      manifest.openapi.some((contract) => contract.artifactPath.startsWith("contracts/")),
      false,
    );
    assert.equal(
      manifest.openapi.some((contract) =>
        contract.artifactPath.startsWith("libs/common/api-contracts/"),
      ),
      false,
    );
    assert.equal(
      manifest.openapi.every((contract) =>
        contract.typesPath.startsWith("libs/common/api-contracts/lib/src/generated/"),
      ),
      true,
    );
    assert.equal(
      manifest.openapi.every((contract) =>
        contract.clientOutputPath.startsWith("libs/frontend/api-client/lib/src/generated/"),
      ),
      true,
    );
  });

  it("keeps the manifest in tooling-owned config instead of repository-root config", () => {
    assert.equal(
      relative(process.cwd(), apiContractsManifestPath).replaceAll("\\", "/"),
      "packages/tooling/config/api-contracts.json",
    );
    assert.equal(existsSync("config" + "/api-contracts.json"), false);
  });
});
