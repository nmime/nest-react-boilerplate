import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
);

const sourceRoots = [
  "apps/frontend/app/src",
  "apps/frontend/admin/src",
  "apps/frontend/landing/src",
  "libs/frontend/ui/src",
];
const allowedExtensions = new Set([".ts", ".tsx"]);
const ignoredSuffixes = [".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx"];
const ignoredDirectories = new Set([
  ".git",
  ".nx",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredFiles = new Set([
  "libs/frontend/ui/src/lib/i18n/no-hardcoded-copy.spec.ts",
]);
const userFacingNames = [
  "aria-label",
  "placeholder",
  "title",
  "appName",
  "description",
  "eyebrow",
  "status",
  "label",
  "detail",
  "message",
  "reason",
  "children",
];
const userFacingAttributePattern = new RegExp(
  `\\b(${userFacingNames.join("|")})=(["'])([^"']*[A-Za-z][^"']*)\\2`,
  "gu",
);
const userFacingObjectPropertyPattern = new RegExp(
  `\\b(${userFacingNames.join("|")})\\s*:\\s*(["'])([^"']*[A-Za-z][^"']*)\\2`,
  "gu",
);

const getJsxTextValues = (line: string): string[] => {
  const values: string[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const closeTagIndex = line.indexOf(">", cursor);
    if (closeTagIndex < 0) {
      break;
    }

    const openTagIndex = line.indexOf("<", closeTagIndex + 1);
    if (openTagIndex < 0) {
      break;
    }

    const value = line.slice(closeTagIndex + 1, openTagIndex).trim();
    if (/[A-Za-z]/u.test(value) && !/[{}]/u.test(value)) {
      values.push(value);
    }
    cursor = openTagIndex + 1;
  }

  return values;
};

const allowedLiteralValues = new Set([
  "Promise",
  "xR",
  "en",
  "es",
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "json",
  "void",
  "text",
  "light",
  "dark",
  "info",
  "success",
  "warning",
  "primary",
  "secondary",
  "ready",
  "loading",
  "forbidden",
  "missing-token",
  "login",
  "register",
]);

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory() ? walk(path) : [path];
  });

const isCheckedSourceFile = (path: string): boolean => {
  const relativePath = relative(workspaceRoot, path);

  return (
    allowedExtensions.has(extname(path)) &&
    !relativePath
      .split(/[\\/]/u)
      .some((segment) => ignoredDirectories.has(segment)) &&
    !ignoredSuffixes.some((suffix) => path.endsWith(suffix)) &&
    !ignoredFiles.has(relativePath)
  );
};

const isLikelyNonCopyLiteral = (value: string): boolean => {
  const normalized = value.trim();

  return (
    normalized.length === 0 ||
    allowedLiteralValues.has(normalized) ||
    /^[a-z0-9@:_./#?=&${}()[\]-]+$/u.test(normalized) ||
    /^[A-Z0-9_]+$/u.test(normalized)
  );
};

type Offender = {
  file: string;
  line: number;
  source: string;
  value: string;
};

const collectOffenders = (): Offender[] =>
  sourceRoots
    .flatMap((root) => walk(join(workspaceRoot, root)))
    .filter(isCheckedSourceFile)
    .flatMap((path) => {
      const relativePath = relative(workspaceRoot, path);
      const lines = readFileSync(path, "utf8").split("\n");
      const offenders: Offender[] = [];

      lines.forEach((line, index) => {
        const checkMatch = (
          pattern: RegExp,
          source: string,
          valueGroup: number,
        ) => {
          pattern.lastIndex = 0;
          for (const match of line.matchAll(pattern)) {
            const value = match[valueGroup]?.trim() ?? "";
            if (!isLikelyNonCopyLiteral(value)) {
              offenders.push({
                file: relativePath,
                line: index + 1,
                source,
                value,
              });
            }
          }
        };

        checkMatch(userFacingAttributePattern, "user-facing attribute", 3);
        checkMatch(userFacingObjectPropertyPattern, "user-facing property", 3);
        for (const value of getJsxTextValues(line)) {
          if (!isLikelyNonCopyLiteral(value)) {
            offenders.push({
              file: relativePath,
              line: index + 1,
              source: "JSX text",
              value,
            });
          }
        }
      });

      return offenders;
    });

describe("frontend i18n static guard", () => {
  it("keeps React user-facing copy behind translation keys", () => {
    expect(collectOffenders()).toEqual([]);
  });
});
