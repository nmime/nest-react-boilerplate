import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const forbiddenAdminSharedImport = ["@app/feature", "admin-shared"].join("-");

function collectTypescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectTypescriptFiles(fullPath);
    }

    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("auth shared RBAC boundary", () => {
  it("does not import admin shared from auth shared source", () => {
    const sourceRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const offenders = collectTypescriptFiles(sourceRoot)
      .filter((filePath) =>
        readFileSync(filePath, "utf8").includes(forbiddenAdminSharedImport),
      )
      .map((filePath) => relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
