import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../..",
);

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
const ignoredFiles = new Set([
  "libs/frontend/api-support/lib/src/lib/api-client.ts",
]);

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory() ? walk(path) : [path];
  });

const isCheckedSourceFile = (path: string): boolean =>
  allowedExtensions.has(path.slice(path.lastIndexOf("."))) &&
  !ignoredSuffixes.some((suffix) => path.endsWith(suffix)) &&
  !ignoredFiles.has(relative(workspaceRoot, path));

describe("frontend request manager guard", () => {
  it("keeps app/admin source on the shared API client instead of raw fetch", () => {
    const offenders = sourceRoots
      .flatMap((root) => walk(join(workspaceRoot, root)))
      .filter(isCheckedSourceFile)
      .filter((path) => /\bfetch\s*\(/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(workspaceRoot, path));

    expect(offenders).toEqual([]);
  });
});
