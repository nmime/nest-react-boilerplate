// @ts-nocheck
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { checkGeneratedContractImports } from "./static-check.ts";

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
