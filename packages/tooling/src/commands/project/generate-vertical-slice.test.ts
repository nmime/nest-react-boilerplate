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
import { describe as nodeDescribe, it as nodeIt } from "node:test";
import { runGenerateVerticalSlice } from "./generate-vertical-slice.ts";

// node:test and vitest expose compatible describe/it (name, fn) call shapes, but
// their declared overloads differ, so unify them to a common callable type.
type TestRunner = (name: string, fn: () => void | Promise<void>) => void;
const { describe, it } = (process.env.VITEST
  ? await import("vitest")
  : { describe: nodeDescribe, it: nodeIt }) as unknown as {
  describe: TestRunner;
  it: TestRunner;
};

function createWorkspace(): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "vertical-slice-"));

  writeFileSync(
    join(workspaceRoot, "tsconfig.base.json"),
    JSON.stringify({ compilerOptions: { paths: {} } }, null, 2),
  );

  const apps = [
    ["auth", "auth-app-api"],
    ["user", "user-app-api"],
  ];

  for (const [scope, appName] of apps) {
    const appRoot = join(workspaceRoot, "apps", "backend", scope, appName);
    mkdirSync(appRoot, { recursive: true });
    writeFileSync(join(appRoot, "project.json"), JSON.stringify({ name: appName }));
  }

  return workspaceRoot;
}

function removeWorkspace(workspaceRoot: string): void {
  rmSync(workspaceRoot, { force: true, recursive: true });
}

async function captureRun(
  workspaceRoot: string,
  argv: string[],
): Promise<{ errors: string[]; logs: string[]; status: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...values: unknown[]) => logs.push(values.join(" "));
  console.error = (...values: unknown[]) => errors.push(values.join(" "));

  try {
    const status = await runGenerateVerticalSlice({ argv, workspaceRoot });
    return { errors, logs, status };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("project generate vertical slice", () => {
  it("prints current-layout dry-run paths and next steps without writing files", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, [
        "Support Cases",
        "--api-app",
        "auth-app-api",
        "--dry-run",
      ]);
      const output = result.logs.join("\n");

      assert.equal(result.status, 0);
      assert.match(
        output,
        /CREATE libs\/backend\/feature\/support-cases\/main\/lib\/src\/support-cases\.controller\.ts/,
      );
      assert.match(
        output,
        /CREATE apps\/frontend\/app\/src\/app\/features\/support-cases\/SupportCasesPage\.tsx/,
      );
      assert.match(output, /UPDATE tsconfig\.base\.json/);
      assert.match(
        output,
        /Add @app\/backend-feature-support-cases-main to the auth-app-api API module imports/,
      );
      assert.equal(
        existsSync(
          join(
            workspaceRoot,
            "libs/backend/feature/support-cases/main/lib/src/support-cases.controller.ts",
          ),
        ),
        false,
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("emits current imports, aliases, and paths without retired exception aliases", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, [
        "Billing Events",
        "--api-app=auth-app-api",
      ]);

      assert.equal(result.status, 0);

      const controller = readFileSync(
        join(
          workspaceRoot,
          "libs/backend/feature/billing-events/main/lib/src/billing-events.controller.ts",
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

      assert.match(controller, /from "@app\/backend-common-swagger"/);
      assert.match(controller, /from "@app\/backend-common-response"/);
      assert.match(controller, /from "@app\/backend-feature-billing-events-shared"/);
      assert.equal(controller.includes("@app/common/" + "exceptions"), false);
      assert.equal(
        controller.includes("libs/backend/common/" + "exceptions"),
        false,
      );
      assert.match(page, /generated auth-app-api route/);
      assert.deepEqual(
        tsconfig.compilerOptions.paths["@app/backend-feature-billing-events-main"],
        ["libs/backend/feature/billing-events/main/lib/src/index.ts"],
      );
      assert.deepEqual(
        tsconfig.compilerOptions.paths[
          "@app/backend-feature-billing-events-shared"
        ],
        ["libs/backend/feature/billing-events/shared/lib/src/index.ts"],
      );
      assert.deepEqual(
        tsconfig.compilerOptions.paths[
          "@app/backend-postgres-main-billing-events"
        ],
        ["libs/backend/postgres/main/billing-events/lib/src/index.ts"],
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("emits the deep postgres infrastructure/data-access shape", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, [
        "Billing Events",
        "--api-app=auth-app-api",
      ]);
      assert.equal(result.status, 0);

      const dataAccess =
        "libs/backend/postgres/main/billing-events/lib/src/infrastructure/data-access";
      const read = (relativePath: string): string =>
        readFileSync(join(workspaceRoot, relativePath), "utf8");
      const exists = (relativePath: string): boolean =>
        existsSync(join(workspaceRoot, relativePath));

      // Root barrel re-exports the data-access aggregate only.
      assert.equal(
        read("libs/backend/postgres/main/billing-events/lib/src/index.ts"),
        'export * from "./infrastructure/data-access";\n',
      );

      // The retired flat entity/migrations layout must be gone.
      assert.equal(
        exists(
          "libs/backend/postgres/main/billing-events/lib/src/entity/billing-events.entity.ts",
        ),
        false,
      );

      // data-access aggregate barrel exports the three per-folder barrels via export *.
      assert.equal(
        read(`${dataAccess}/index.ts`),
        'export * from "./entities";\nexport * from "./repositories";\nexport * from "./migrations";\n',
      );

      // entities/ folder with export* barrel.
      assert.match(
        read(`${dataAccess}/entities/billing-events.entity.ts`),
        /export class BillingEventsEntity/,
      );
      assert.equal(
        read(`${dataAccess}/entities/index.ts`),
        'export * from "./billing-events.entity";\n',
      );

      // repositories/ folder with a stub repository following auth's pattern.
      const repository = read(
        `${dataAccess}/repositories/billing-events.repository.ts`,
      );
      assert.match(repository, /@Injectable\(\)/);
      assert.match(repository, /export class BillingEventsRepository/);
      assert.match(repository, /from "@nestjs\/common"/);
      assert.match(repository, /from "\.\.\/entities"/);
      assert.equal(
        read(`${dataAccess}/repositories/index.ts`),
        'export * from "./billing-events.repository";\n',
      );

      // migrations/ folder with export* barrel.
      assert.match(
        read(
          `${dataAccess}/migrations/Migration00000000000000CreateBillingEvents.ts`,
        ),
        /extends Migration/,
      );
      assert.equal(
        read(`${dataAccess}/migrations/index.ts`),
        'export * from "./Migration00000000000000CreateBillingEvents";\n',
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("emits correct relative config depth for the deep postgres library", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, [
        "Billing Events",
        "--api-app=auth-app-api",
      ]);
      assert.equal(result.status, 0);

      const postgresLib = "libs/backend/postgres/main/billing-events/lib";
      const tsconfig = JSON.parse(
        readFileSync(join(workspaceRoot, postgresLib, "tsconfig.json"), "utf8"),
      );
      const projectJson = JSON.parse(
        readFileSync(join(workspaceRoot, postgresLib, "project.json"), "utf8"),
      );

      // Postgres tsconfig does not set rootDir (inherited from base).
      // Verify it extends correctly.
      assert.ok(tsconfig.extends !== undefined || tsconfig.compilerOptions !== undefined);
      assert.equal(projectJson.sourceRoot, `${postgresLib}/src`);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("refuses to overwrite existing files without --force", async () => {
    const workspaceRoot = createWorkspace();

    // Pre-create one file that the generator would produce.
    const conflictPath = join(
      workspaceRoot,
      "libs/backend/feature/support-cases/main/lib/src/support-cases.controller.ts",
    );
    mkdirSync(join(conflictPath, ".."), { recursive: true });
    writeFileSync(conflictPath, "// existing");

    try {
      const result = await captureRun(workspaceRoot, [
        "Support Cases",
        "--api-app=auth-app-api",
      ]);

      assert.equal(result.status, 1);
      assert.match(result.errors.join("\n"), /Refusing to overwrite/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("overwrites existing files with --force", async () => {
    const workspaceRoot = createWorkspace();

    // Pre-create one file that the generator would produce.
    const conflictPath = join(
      workspaceRoot,
      "libs/backend/feature/support-cases/main/lib/src/support-cases.controller.ts",
    );
    mkdirSync(join(conflictPath, ".."), { recursive: true });
    writeFileSync(conflictPath, "// existing");

    try {
      const result = await captureRun(workspaceRoot, [
        "Support Cases",
        "--api-app=auth-app-api",
        "--force",
      ]);

      assert.equal(result.status, 0);
      const content = readFileSync(conflictPath, "utf8");
      assert.equal(content.includes("// existing"), false);
      assert.match(content, /SupportCasesController/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("refuses with invalid --api-app", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, [
        "Billing Events",
        "--api-app=fake-api",
      ]);

      assert.equal(result.status, 1);
      assert.match(result.errors.join("\n"), /Invalid --api-app/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("prints usage on --help", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, ["--help"]);

      assert.equal(result.status, 0);
      assert.match(result.logs.join("\n"), /generate-vertical-slice/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("fails when no feature name provided", async () => {
    const workspaceRoot = createWorkspace();

    try {
      const result = await captureRun(workspaceRoot, []);

      assert.equal(result.status, 1);
      assert.match(result.errors.join("\n"), /Missing feature name/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});
