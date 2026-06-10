import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../../../../..");
const uiSourceRoot = join(workspaceRoot, "libs/frontend/ui/lib/src");
const allowedExtensions = new Set([".ts", ".tsx", ".css"]);
const ignoredSuffixes = [
  ".spec.ts",
  ".spec.tsx",
  ".stories.ts",
  ".stories.tsx",
];
const forbiddenProductionPatterns = [
  /@app\/api-client/u,
  /@app\/api-contracts/u,
  /@app\/frontend-api-support/u,
  /@app\/common\/(?:api|response|swagger|exception)\b/u,
  /@app\/backend/u,
  /(?:^|["'])apps\/frontend/u,
  /(?:^|["'])libs\/backend/u,
  /\bfetch\s*\(/u,
];

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory() ? walk(path) : [path];
  });

const isCheckedFile = (path: string): boolean =>
  allowedExtensions.has(extname(path)) &&
  !ignoredSuffixes.some((suffix) => path.endsWith(suffix));

describe("shared UI FSD boundary", () => {
  it("keeps production UI sources free of API/client/app/backend coupling", () => {
    const offenders = walk(uiSourceRoot)
      .filter(isCheckedFile)
      .flatMap((path) => {
        const relativePath = relative(workspaceRoot, path);
        const content = readFileSync(path, "utf8");
        const isForbidden = forbiddenProductionPatterns.some((pattern) =>
          pattern.test(content),
        );

        return isForbidden ? [relativePath] : [];
      });

    expect(offenders).toEqual([]);
  });

  it("does not publicly re-export API-support helpers", () => {
    const publicBarrel = readFileSync(join(uiSourceRoot, "index.ts"), "utf8");

    expect(publicBarrel).not.toContain("./lib/api/api-client");
  });
});
