// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadApiContractsManifest } from "./contracts-manifest.ts";

describe("api contracts manifest", () => {
  it("keeps live JSON artifacts in non-buildable owner artifact projects", () => {
    const manifest = loadApiContractsManifest();
    assert.deepEqual(
      manifest.openapi.map((contract) => contract.artifactPath),
      [
        "apps/backend/auth-app-api-contracts/openapi/auth-app-api.json",
        "apps/backend/user-app-api-contracts/openapi/user-app-api.json",
        "apps/backend/admin-app-api-contracts/openapi/admin-app-api.json",
      ],
    );
    assert.deepEqual(
      manifest.consumers.map((contract) => contract.artifactPath),
      ["apps/frontend/app-contracts/consumers/frontend-auth.pact.json"],
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
});
