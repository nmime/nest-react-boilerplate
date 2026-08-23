// @requirements REQ-API-COMPAT-002
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  checkEndpointManifest,
  diffEndpointManifests,
  endpointManifestText,
  generateEndpointManifest,
  validateEndpointManifest,
  type EndpointManifest,
  type EndpointManifestRow,
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

  it("fails the check on a newly discovered endpoint that has no baseline row", () => {
    const baseline = row("GET", "/example");
    const generated: EndpointManifest = {
      schemaVersion: 1,
      rows: [baseline, row("GET", "/example/new")],
    };
    const issues = diffEndpointManifests({ schemaVersion: 1, rows: [baseline] }, generated);
    assert.deepEqual(issues.map((issue) => issue.code), ["new-endpoint"]);
    assert.match(issues[0]?.message ?? "", /no checked-in classification row/u);
  });

  it("fails the check on an endpoint that disappeared from source", () => {
    const gone = row("GET", "/retired");
    const issues = diffEndpointManifests(
      { schemaVersion: 1, rows: [gone] },
      { schemaVersion: 1, rows: [] },
    );
    assert.deepEqual(issues.map((issue) => issue.code), ["removed-endpoint"]);
    assert.match(issues[0]?.message ?? "", /no longer discovered from source/u);
  });

  it("fails the check on a re-classified endpoint and names the changed fields", () => {
    const baseline = row("GET", "/example");
    const reclassified: EndpointManifestRow = {
      ...baseline,
      coverageClassification: "covered-component",
      testEvidence: "other.spec.ts:1",
      smoke: { ...baseline.smoke!, classification: "cookie-session", expectedStatusClasses: ["2xx", "3xx"] },
    };
    const issues = diffEndpointManifests(
      { schemaVersion: 1, rows: [baseline] },
      { schemaVersion: 1, rows: [reclassified] },
    );
    assert.deepEqual(issues.map((issue) => issue.code), ["changed-endpoint"]);
    const message = issues[0]?.message ?? "";
    assert.match(message, /coverageClassification, testEvidence, smoke/u);
  });

  it("reports no diff for an identical baseline", () => {
    const manifest = { schemaVersion: 1, rows: [row("GET", "/a"), row("GET", "/b")] } as EndpointManifest;
    assert.deepEqual(diffEndpointManifests(manifest, JSON.parse(JSON.stringify(manifest))), []);
  });

  it("flags an unparseable checked-in baseline as malformed instead of diffing blindly", () => {
    const root = mkdtempSync(join(tmpdir(), "endpoint-manifest-bad-"));
    try {
      const workspace = fixtureWorkspace(root, "not json at all");
      const issues = checkEndpointManifest(workspace);
      assert.ok(
        issues.some((issue) => issue.code === "invalid-smoke" && /malformed/u.test(issue.message)),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function row(method: string, path: string): EndpointManifestRow {
  return {
    project: "example-api",
    kind: "http",
    method,
    path,
    source: "source.ts:1",
    authClassification: "public",
    coverageClassification: "covered-unit",
    testEvidence: "source.spec.ts:1",
    smoke: {
      baseUrlEnv: "EXAMPLE_BASE_URL",
      classification: "automatic",
      expectedStatusClasses: ["2xx"],
    },
  };
}

function write(root: string, path: string, content: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A minimal but complete fixture workspace for checkEndpointManifest: the
 * discovery process requires the shared health controller, the swagger
 * source and the frontend route registries to exist; the checked-in baseline
 * carries the supplied content.
 */
function fixtureWorkspace(root: string, manifestContent: string): string {
  const workspace = join(root, "workspace");
  write(
    workspace,
    "libs/backend/common/health/lib/src/base-health.controller.ts",
    [
      "import { Controller, Get } from '@nestjs/common';",
      "@Controller()",
      "export class BaseHealthController {",
      "  @Get('health') health() { return {}; }",
      "}",
      "",
    ].join("\n"),
  );
  write(
    workspace,
    "libs/backend/common/swagger/lib/src/swagger.util.ts",
    ["export function setupSwagger() {", "  SwaggerModule.setup('docs');", "}"].join("\n"),
  );
  write(
    workspace,
    "apps/frontend/admin/src/shared/admin-route-registry.ts",
    ["export const adminRoutes = {", "  paths: ['/dashboard'],", "};", ""]
      .join("\n"),
  );
  write(
    workspace,
    "apps/frontend/app/src/app/router/user-routes.tsx",
    ["export const userRoutes = [{ path: '/' }];", ""].join("\n"),
  );
  write(
    workspace,
    "packages/tooling/baselines/endpoint-manifest.generated.json",
    manifestContent,
  );
  return workspace;
}
