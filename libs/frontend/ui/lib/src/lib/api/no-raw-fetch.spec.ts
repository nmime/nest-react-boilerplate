import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../../../../..");
const frontendRoots = [
  "apps/frontend/app/src",
  "apps/frontend/admin/src",
  "apps/frontend/landing/src",
  "libs/frontend/ui/lib/src",
  "libs/frontend/api-support/lib/src",
  "libs/frontend/api-client/lib/src",
];
const allowedExtensions = new Set([".ts", ".tsx"]);
const ignoredSuffixes = [
  ".spec.ts",
  ".spec.tsx",
  ".test.ts",
  ".test.tsx",
  ".stories.ts",
  ".stories.tsx",
];
const ignoredDirectories = new Set([
  ".git",
  ".nx",
  "coverage",
  "dist",
  "node_modules",
]);
const rawFetchAllowlist = new Set([
  "libs/frontend/api-support/lib/src/lib/api-client.ts",
]);

const walk = (directory: string): string[] => {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (
      stat.isDirectory() &&
      !relative(workspaceRoot, path)
        .split(/[\\/]/u)
        .some((segment) => ignoredDirectories.has(segment))
    ) {
      return walk(path);
    }

    return stat.isFile() ? [path] : [];
  });
};

const isCheckedSourceFile = (path: string): boolean => {
  const relativePath = relative(workspaceRoot, path);

  return (
    allowedExtensions.has(extname(path)) &&
    !ignoredSuffixes.some((suffix) => path.endsWith(suffix)) &&
    !rawFetchAllowlist.has(relativePath)
  );
};

describe("frontend request manager guard", () => {
  it("keeps every frontend app/lib on approved API clients instead of raw fetch", () => {
    const offenders = frontendRoots
      .flatMap((root) => walk(join(workspaceRoot, root)))
      .filter(isCheckedSourceFile)
      .filter((path) => /\bfetch\s*\(/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(workspaceRoot, path));

    expect(offenders).toEqual([]);
  });
});
