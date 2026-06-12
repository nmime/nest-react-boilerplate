// @ts-nocheck
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  checkGeneratedContractImports,
  checkPackageProjectReferences,
  checkStaleReferences,
  checkWorkspaceMetadata,
} from "./static-check.ts";

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "static-check-generated-imports-"));
}

function removeWorkspace(workspaceRoot: string): void {
  rmSync(workspaceRoot, { force: true, recursive: true });
}

function writeText(workspaceRoot: string, path: string, text: string): void {
  const file = join(workspaceRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

describe("static-check generated contract import guard", () => {
  it("rejects deep generated contract imports from app feature source", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/auth/api/generated-import.ts",
        'import type { paths } from "../../../../../../../libs/common/api-contracts/lib/src/generated/auth-app-api";\n\nexport type Forbidden = paths;\n',
      );

      const failures = checkGeneratedContractImports(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "generated contract public import boundary",
      );
      assert.equal(
        failures[0].file,
        "apps/frontend/app/src/features/auth/api/generated-import.ts:1",
      );
      assert.match(failures[0].stderr, /stable public aliases/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("allows generated internals inside owning contract/client packages", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/common/api-contracts/lib/src/index.ts",
        'export type { paths } from "./generated/auth-app-api";\n',
      );
      writeText(
        workspaceRoot,
        "libs/frontend/api-client/lib/src/index.ts",
        'export { createAuthClient } from "./generated/auth";\n',
      );
      writeText(
        workspaceRoot,
        "AGENTS.md",
        "Generated contract artifacts live under libs/common/api-contracts/lib/src/generated.\n",
      );

      assert.deepEqual(checkGeneratedContractImports(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check workspace metadata guard", () => {
  it("rejects duplicate tag prefixes and duplicate TS path targets", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/example/project.json",
        JSON.stringify({
          name: "example",
          tags: ["platform:shared", "type:common", "type:util"],
        }),
      );
      writeText(
        workspaceRoot,
        "tsconfig.base.json",
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@app/example": ["libs/example/src/index.ts"],
              "@app/example-compat": ["libs/example/src/index.ts"],
            },
          },
        }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({ name: "@repo/tooling" }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.deepEqual(
        failures.map((failure) => failure.command).sort(),
        [
          "workspace metadata project tags",
          "workspace metadata tsconfig paths",
        ],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /multiple type:/);
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /Duplicate TS path target/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("keeps packages/tooling as the only package-style workspace", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "tsconfig.base.json",
        JSON.stringify({ compilerOptions: { paths: {} } }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({ name: "@repo/tooling" }),
      );
      writeText(
        workspaceRoot,
        "packages/runtime/package.json",
        JSON.stringify({ name: "@repo/runtime" }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "workspace metadata package manifests",
      );
      assert.match(failures[0].stderr, /packages\/tooling/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check stale admin API name guard", () => {
  it("rejects the retired duplicated admin API project name", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "docs/stale-admin-api.md",
        `Use ${"backend-"}admin-app-api for the admin API.\n`,
      );

      const failures = checkStaleReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "stale architecture/version denylist");
      assert.equal(failures[0].file, "docs/stale-admin-api.md:1");
      assert.match(failures[0].stderr, /duplicated admin API project name/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check package project reference guard", () => {
  it("rejects stale package test scripts that reference removed Nx projects", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "test:e2e":
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,admin-app-api,user-app-api,auth-app-api",
          },
        }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/admin/project.json",
        JSON.stringify({ name: "admin-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/app/project.json",
        JSON.stringify({ name: "user-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/landing/project.json",
        JSON.stringify({ name: "landing-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/admin-app-api/project.json",
        JSON.stringify({ name: "retired-admin-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/user-app-api/project.json",
        JSON.stringify({ name: "user-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/auth-app-api/project.json",
        JSON.stringify({ name: "auth-app-api" }),
      );

      const failures = checkPackageProjectReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "package.json project reference package.json#test:e2e",
      );
      assert.equal(failures[0].file, "package.json");
      assert.match(failures[0].stderr, /admin-app-api/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts package test scripts whose referenced Nx projects exist", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "test:e2e":
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,admin-app-api,user-app-api,auth-app-api",
          },
        }),
      );
      for (const projectName of [
        "admin-app",
        "user-app",
        "landing-app",
        "admin-app-api",
        "user-app-api",
        "auth-app-api",
      ]) {
        writeText(
          workspaceRoot,
          `apps/${projectName}/project.json`,
          JSON.stringify({ name: projectName }),
        );
      }

      assert.deepEqual(checkPackageProjectReferences(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});
