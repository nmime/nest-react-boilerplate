import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../../../../..");

const sourceRoots = [
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
const rawFetchOwnerFiles = new Set([
  "libs/frontend/api-support/lib/src/lib/api-client.ts",
]);

const walk = (directory: string): string[] => {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory() ? walk(path) : [path];
  });
};

const isCheckedSourceFile = (path: string): boolean => {
  const relativePath = relative(workspaceRoot, path);

  return (
    allowedExtensions.has(extname(path)) &&
    !relativePath
      .split(/[/\\]/u)
      .some((segment) => ignoredDirectories.has(segment)) &&
    !ignoredSuffixes.some((suffix) => path.endsWith(suffix)) &&
    !rawFetchOwnerFiles.has(relativePath)
  );
};

describe("frontend raw fetch boundary", () => {
  it("keeps raw fetch centralized in @app/frontend-api-support", () => {
    const offenders = sourceRoots
      .flatMap((root) => walk(join(workspaceRoot, root)))
      .filter(isCheckedSourceFile)
      .filter((path) => /\bfetch\s*\(/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(workspaceRoot, path));

    expect(offenders).toEqual([]);
  });
});
