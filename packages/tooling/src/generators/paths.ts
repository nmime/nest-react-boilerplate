/**
 * Path utility: compute the relative number of `../` segments needed to reach
 * workspace root from a given directory path.
 *
 *   relativeDepth("libs/backend/common/response/lib") => 5  (five ../ to reach root)
 */
export function relativeDepth(dir: string): number {
  return dir.split("/").length;
}

/**
 * Build the `extends` value for a tsconfig.json that lives at `libDir` and needs
 * to reach `tsconfig.base.json` at the workspace root.
 *
 * Returns e.g. `"../../../../../tsconfig.base.json"` for a 5-level-deep dir.
 */
export function tsconfigBaseExtends(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}tsconfig.base.json`;
}

/**
 * Build the `$schema` path from a `libDir` to `node_modules/nx/schemas/project-schema.json`.
 */
export function projectSchemaPath(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}node_modules/nx/schemas/project-schema.json`;
}

/**
 * Build the outDir for tsconfig.lib.json: dist/out-tsc/<libDir>
 */
export function outDir(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}dist/out-tsc/${libDir}`;
}

/**
 * Build the outDir for tsconfig.spec.json: dist/out-tsc/<libDir>-spec
 */
export function specOutDir(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}dist/out-tsc/${libDir}-spec`;
}

/**
 * Build the vitest cacheDir: node_modules/.vitest/<libDir>
 */
export function vitestCacheDir(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}node_modules/.vitest/${libDir}`;
}

/**
 * Build the coverage dir: coverage/<libDir>
 */
export function coverageDir(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}coverage/${libDir}`;
}

/**
 * Build the workspace config import path from libDir.
 */
export function workspaceConfigImport(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}config/vite/workspace-tsconfig-aliases.mjs`;
}

/**
 * Build the fullCoverage import path from libDir.
 */
export function fullCoverageImport(libDir: string): string {
  const dots = "../".repeat(relativeDepth(libDir));
  return `${dots}packages/tooling/src/testing/vitest-coverage.mts`;
}
