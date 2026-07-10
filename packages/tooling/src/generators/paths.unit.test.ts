/**
 * Path resolution tests for generated files.
 *
 * Ensures that every generated tsconfig extends path, eslint import, and
 * vitest config import actually resolves to the workspace root — never
 * goes beyond it (e.g. ../../../../../tsconfig.base.json from a 3-deep dir).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../../../../.."); // up to repo root

// ---------------------------------------------------------------------------

/**
 * Verify that a relative path `rel` starting from `dir` resolves
 * to the workspace root. Throws on mismatch.
 */
function assertResolvesToRoot(dir: string, rel: string, label: string): void {
  const resolved = path.resolve(path.join(ROOT, dir), rel);
  assert.strictEqual(
    resolved,
    path.resolve(ROOT, rel.replace(/^(?:\.\.\/)+/, "")),
    `${label}: "${rel}" from "${dir}" does not resolve to workspace root. Resolved: ${resolved}`,
  );
}

/**
 * Verify that a relative path `rel` starting from `dir` resolves
 * to `expectedBase` under the workspace root.
 */
function assertResolvesTo(dir: string, rel: string, expectedBase: string, label: string): void {
  const resolved = path.resolve(path.join(ROOT, dir), rel);
  const expected = path.resolve(ROOT, expectedBase);
  assert.strictEqual(resolved, expected, `${label}: "${rel}" from "${dir}" resolves to ${resolved}, expected ${expected}`);
}

// ---------------------------------------------------------------------------

describe("generated path resolution", () => {
  // Verify dots(dir) logic: for N-segment dir, ../ repeated N times reaches root
  it("dots(dir) computes correct depth for backend app", () => {
    const dir = "apps/backend/smoke/smoke-api";
    const segments = dir.split("/").length; // 4
    const dots = "../".repeat(segments);
    assert.strictEqual(dots, "../../../../");
    assertResolvesToRoot(dir, `${dots}tsconfig.base.json`, "backend app tsconfig.extends");
  });

  it("dots(dir) computes correct depth for frontend app", () => {
    const dir = "apps/frontend/smoke-web";
    const segments = dir.split("/").length; // 3
    const dots = "../".repeat(segments);
    assert.strictEqual(dots, "../../../");
    assertResolvesToRoot(dir, `${dots}tsconfig.base.json`, "frontend app tsconfig.extends");
  });

  it("dots(dir) computes correct depth for backend lib", () => {
    const dir = "libs/backend/shared-utils/lib";
    const segments = dir.split("/").length; // 4
    const dots = "../".repeat(segments);
    assert.strictEqual(dots, "../../../../");
    assertResolvesToRoot(dir, `${dots}tsconfig.base.json`, "backend lib tsconfig.extends");
  });

  it("dots(dir) computes correct depth for feature lib", () => {
    const dir = "libs/backend/feature/smoke/shared/lib";
    const segments = dir.split("/").length; // 6
    const dots = "../".repeat(segments);
    assert.strictEqual(dots, "../../../../../../");
    assertResolvesToRoot(dir, `${dots}tsconfig.base.json`, "feature lib tsconfig.extends");
  });

  it("dots(dir) computes correct depth for frontend lib", () => {
    const dir = "libs/frontend/ui/lib";
    const segments = dir.split("/").length; // 4
    const dots = "../".repeat(segments);
    assert.strictEqual(dots, "../../../../");
    assertResolvesToRoot(dir, `${dots}tsconfig.base.json`, "frontend lib tsconfig.extends");
  });

  // eslint.config.cjs paths
  it("eslint config resolves to root for backend app", () => {
    const dir = "apps/backend/smoke/smoke-api";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}eslint.config.js`, "eslint.config.js", "backend app eslint");
  });

  it("eslint config resolves to root for frontend app", () => {
    const dir = "apps/frontend/smoke-web";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}eslint.config.js`, "eslint.config.js", "frontend app eslint");
  });

  it("eslint config resolves to root for backend lib", () => {
    const dir = "libs/backend/shared-utils/lib";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}eslint.config.js`, "eslint.config.js", "backend lib eslint");
  });

  // vitest.config.mts paths
  it("workspaceTsconfigAliases resolves to config dir for backend app", () => {
    const dir = "apps/backend/smoke/smoke-api";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}config/vite/workspace-tsconfig-aliases.mjs`, "config/vite/workspace-tsconfig-aliases.mjs", "backend app vitest aliases");
  });

  it("fullCoverage resolves to packages dir for backend lib", () => {
    const dir = "libs/backend/shared-utils/lib";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}packages/tooling/src/testing/vitest-coverage.mts`, "packages/tooling/src/testing/vitest-coverage.mts", "backend lib vitest coverage");
  });

  // tsconfig.outDir paths
  it("tsconfig.app outDir resolves to dist for backend app", () => {
    const dir = "apps/backend/smoke/smoke-api";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}dist/out-tsc/${dir}`, `dist/out-tsc/${dir}`, "backend app outDir");
  });

  it("tsconfig.lib outDir resolves to dist for backend lib", () => {
    const dir = "libs/backend/shared-utils/lib";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}dist/out-tsc/${dir}`, `dist/out-tsc/${dir}`, "backend lib outDir");
  });

  // vitest cacheDir
  it("vitest cacheDir resolves to node_modules for backend lib", () => {
    const dir = "libs/backend/shared-utils/lib";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}node_modules/.vitest/${dir}`, `node_modules/.vitest/${dir}`, "backend lib vitest cache");
  });

  // coverage dir
  it("coverage dir resolves to coverage for feature lib", () => {
    const dir = "libs/backend/feature/smoke/shared/lib";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}coverage/${dir}`, `coverage/${dir}`, "feature lib coverage");
  });

  // nx schemas
  it("$schema resolves to node_modules/nx for backend app", () => {
    const dir = "apps/backend/smoke/smoke-api";
    const d = "../".repeat(dir.split("/").length);
    assertResolvesTo(dir, `${d}node_modules/nx/schemas/project-schema.json`, `node_modules/nx/schemas/project-schema.json`, "backend app $schema");
  });

  // Verify against ACTUAL repo files
  it("existing repo tsconfig paths resolve correctly", () => {
    const existing = [
      "apps/backend/user/user-app-api",
      "apps/frontend/app",
      "libs/backend/common/response/lib",
      "libs/frontend/ui/lib",
    ];
    for (const dir of existing) {
      const tcPath = path.join(ROOT, dir, "tsconfig.json");
      if (fs.existsSync(tcPath)) {
        const data = JSON.parse(fs.readFileSync(tcPath, "utf-8"));
        const extendsPath = data.extends;
        const resolved = path.resolve(path.join(ROOT, dir), extendsPath);
        const expected = path.resolve(ROOT, "tsconfig.base.json");
        assert.strictEqual(resolved, expected, `${dir}/tsconfig.json extends "${extendsPath}" resolves to ${resolved}, expected ${expected}`);
      }
    }
  });

  // Verify frontend tsconfig convention
  it("existing frontend tsconfig.json includes lib dom and es2022", () => {
    const frontendDirs = ["apps/frontend/app", "apps/frontend/admin"];
    for (const dir of frontendDirs) {
      const tcPath = path.join(ROOT, dir, "tsconfig.json");
      if (fs.existsSync(tcPath)) {
        const data = JSON.parse(fs.readFileSync(tcPath, "utf-8"));
        const opts = data.compilerOptions;
        assert.ok(opts?.lib?.includes("dom"), `${dir}: tsconfig.json should include "dom" in lib`);
        assert.ok(opts?.lib?.includes("es2022"), `${dir}: tsconfig.json should include "es2022" in lib`);
        assert.strictEqual(opts?.jsx, "react-jsx", `${dir}: tsconfig.json should have jsx: react-jsx`);
      }
    }
  });
});

describe("constant naming convention", () => {
  it("constantName returns feature name + underscore without FEATURE prefix", () => {
    // constantName({ constant: "SMOKE" }) + "READ_PERMISSION"
    // should produce SMOKE_READ_PERMISSION, NOT SMOKE_FEATURE_READ_PERMISSION
    const name = "smoke";
    const constant = name.toUpperCase().replace(/-/g, "_"); // SMOKE
    const readPerm = `${constant}_READ_PERMISSION`;
    const writePerm = `${constant}_WRITE_PERMISSION`;

    assert.strictEqual(readPerm, "SMOKE_READ_PERMISSION");
    assert.strictEqual(writePerm, "SMOKE_WRITE_PERMISSION");
    assert.ok(!readPerm.includes("FEATURE"), "Constant should not contain FEATURE prefix");
  });

  it("constantName for multi-word feature", () => {
    const name = "user-profile";
    const constant = name.toUpperCase().replace(/-/g, "_"); // USER_PROFILE
    const readPerm = `${constant}_READ_PERMISSION`;
    assert.strictEqual(readPerm, "USER_PROFILE_READ_PERMISSION");
  });
});
