// @ts-nocheck
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runGenerateVerticalSlice } from "./generate-vertical-slice.ts";

function createWorkspace(): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "vertical-slice-"));

  writeFileSync(
    join(workspaceRoot, "tsconfig.base.json"),
    JSON.stringify({ compilerOptions: { paths: {} } }, null, 2),
  );

  for (const appName of ["auth-app-api", "user-app-api"]) {
    const appRoot = join(workspaceRoot, "apps/backend", appName);
    mkdirSync(appRoot, { recursive: true });
    writeFileSync(join(appRoot, "project.json"), JSON.stringify({ name: appName }));
  }

  return workspaceRoot;
}

function removeWorkspace(workspaceRoot: string): void {
  rmSync(workspaceRoot, { force: true, recursive: true });
}

function captureRun(workspaceRoot: string, argv: string[]): {
  errors: string[];
  logs: string[];
  status: number;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...values: unknown[]) => logs.push(values.join(" "));
  console.error = (...values: unknown[]) => errors.push(values.join(" "));

  try {
    return {
      errors,
      logs,
      status: runGenerateVerticalSlice({ argv, workspaceRoot }),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("project generate vertical slice", () => {
  it("prints current-layout dry-run paths and next steps without writing files", () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = captureRun(workspaceRoot, [
        "Support Cases",
        "--api-app",
        "auth-app-api",
        "--dry-run",
      ]);
      const output = result.logs.join("\\n");

      assert.equal(result.status, 0);
      assert.match(
        output,
        /CREATE libs\/backend\/feature\/support-cases\/main\/lib\/src\/lib\/support-cases\.controller\.ts/,
      );
      assert.match(
        output,
        /CREATE apps\/frontend\/app\/src\/app\/features\/support-cases\/SupportCasesPage\.tsx/,
      );
      assert.match(output, /UPDATE tsconfig\.base\.json path aliases/);
      assert.match(
        output,
        /Add @app\/feature-support-cases-main to the auth-app-api API module imports/,
      );
      assert.equal(
        existsSync(
          join(
            workspaceRoot,
            "libs/backend/feature/support-cases/main/lib/src/lib/support-cases.controller.ts",
          ),
        ),
        false,
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("emits current imports, aliases, and paths without retired exception aliases", () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = captureRun(workspaceRoot, [
        "Billing Events",
        "--api-app=auth-app-api",
      ]);

      assert.equal(result.status, 0);

      const controller = readFileSync(
        join(
          workspaceRoot,
          "libs/backend/feature/billing-events/main/lib/src/lib/billing-events.controller.ts",
        ),
        "utf8",
      );
      const page = readFileSync(
        join(
          workspaceRoot,
          "apps/frontend/app/src/app/features/billing-events/BillingEventsPage.tsx",
        ),
        "utf8",
      );
      const tsconfig = JSON.parse(
        readFileSync(join(workspaceRoot, "tsconfig.base.json"), "utf8"),
      );

      assert.match(controller, /from "@app\/common\/swagger"/);
      assert.match(controller, /from "@app\/common\/response"/);
      assert.match(controller, /from "@app\/feature-billing-events-shared"/);
      assert.equal(controller.includes("@app/common/" + "exceptions"), false);
      assert.equal(
        controller.includes("libs/backend/common/" + "exceptions"),
        false,
      );
      assert.match(page, /generated auth-app-api route/);
      assert.deepEqual(
        tsconfig.compilerOptions.paths["@app/feature-billing-events-main"],
        ["libs/backend/feature/billing-events/main/lib/src/index.ts"],
      );
      assert.deepEqual(
        tsconfig.compilerOptions.paths["@app/feature-billing-events-shared"],
        ["libs/backend/feature/billing-events/shared/lib/src/index.ts"],
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects invalid api app values with a clear message", () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = captureRun(workspaceRoot, [
        "Reports",
        "--api-app",
        "missing-api",
        "--dry-run",
      ]);

      assert.equal(result.status, 1);
      assert.match(result.errors.join("\\n"), /Invalid --api-app "missing-api"/);
      assert.match(result.errors.join("\\n"), /auth-app-api, user-app-api/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});
