// @requirements REQ-API-COMPAT-002
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  checkEndpointManifest,
  endpointManifestText,
  generateEndpointManifest,
  validateEndpointManifest,
} from "./endpoint-manifest.ts";

describe("canonical endpoint manifest", () => {
  const workspaceRoot = process.cwd();

  it("regenerates exactly from source and explicit runtime registries", () => {
    assert.deepEqual(checkEndpointManifest(workspaceRoot), []);
    const manifest = generateEndpointManifest(workspaceRoot);
    assert.ok(manifest.rows.length >= 172);
    assert.equal(
      manifest.rows.filter((row) => row.path === "/api/auth/*").length,
      1,
    );
    assert.equal(
      manifest.rows.find((row) => row.path === "/api/auth/*")?.testEvidence,
      "libs/backend/feature/auth/main/lib/src/application/better-auth-runtime-contract.spec.ts",
    );
    assert.doesNotMatch(endpointManifestText(manifest), /uncovered/u);
  });

  it("rejects duplicate rows and missing source, evidence, or smoke classifications", () => {
    const root = mkdtempSync(join(tmpdir(), "endpoint-manifest-"));
    try {
      write(root, "source.ts", "export const value = 1;\n");
      write(root, "source.spec.ts", "// evidence\n");
      const row = {
        project: "example-api",
        kind: "http" as const,
        method: "GET",
        path: "/example",
        source: "source.ts:1",
        authClassification: "public" as const,
        coverageClassification: "covered-unit" as const,
        testEvidence: "source.spec.ts:1",
      };
      const issues = validateEndpointManifest(root, {
        schemaVersion: 1,
        rows: [row, { ...row, source: "missing.ts:1" }],
      });
      assert.ok(issues.some((issue) => issue.code === "duplicate"));
      assert.ok(issues.some((issue) => issue.code === "missing-source"));
      assert.ok(issues.some((issue) => issue.code === "invalid-smoke"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function write(root: string, path: string, content: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
