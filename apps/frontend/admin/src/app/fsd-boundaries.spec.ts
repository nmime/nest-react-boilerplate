import { readdirSync, readFileSync } from "node:fs";
import { join as joinPath, relative } from "node:path";
import { describe, expect, it } from "vitest";

const orderedLayers = [
  "app",
  "pages",
  "widgets",
  "features",
  "entities",
  "shared",
] as const;

type Layer = (typeof orderedLayers)[number];

const layerRank = new Map<Layer, number>(
  orderedLayers.map((layer, index) => [layer, index]),
);

const sourceRoot = joinPath(process.cwd(), "src");
const layerPublicImportPattern =
  /from\s+["']\.\.\/(?:\.\.\/)*(?:pages|widgets|features|entities|shared)\/([^"']+)["']/u;
const bypassedSegmentPattern = /\/(?:api|model|ui|lib)\//u;
const indexImportPattern = /\/index(?:\.ts|\.tsx)?$/u;
const appBusinessBypassPattern = /from\s+["']\.\.\/(?:entities|features)\//u;

const readSourceFiles = (directory: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolutePath = joinPath(directory, entry.name);
      if (entry.isDirectory()) {
        return Object.entries(readSourceFiles(absolutePath));
      }
      if (!/\.(?:ts|tsx)$/u.test(entry.name)) {
        return [];
      }
      const path = `../${relative(sourceRoot, absolutePath).replaceAll("\\", "/")}`;
      return [[path, readFileSync(absolutePath, "utf8")]];
    }),
  );

const sourceFiles = readSourceFiles(sourceRoot);

const getLayer = (path: string): Layer | undefined =>
  orderedLayers.find((layer) => path.startsWith(`../${layer}/`));

const importPattern =
  /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gu;

const resolveRelativeLayer = (
  importer: string,
  specifier: string,
): Layer | undefined => {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const stack = importer.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return getLayer(stack.join("/"));
};

describe("admin strict FSD boundaries", () => {
  it("keeps imports directed toward lower layers only", () => {
    const violations: string[] = [];

    for (const [path, source] of Object.entries(sourceFiles)) {
      if (path.endsWith(".spec.ts") || path.endsWith(".spec.tsx")) continue;
      const importerLayer = getLayer(path);
      if (!importerLayer) continue;
      const importerRank =
        layerRank.get(importerLayer) ?? Number.POSITIVE_INFINITY;

      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? match[2] ?? "";
        const importedLayer = resolveRelativeLayer(path, specifier);
        if (!importedLayer) continue;
        const importedRank =
          layerRank.get(importedLayer) ?? Number.POSITIVE_INFINITY;
        if (importedRank < importerRank) {
          violations.push(`${path} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps app imports at provider/router boundary and uses layer public APIs", () => {
    const violations = Object.entries(sourceFiles)
      .filter(
        ([path]) => !path.endsWith(".spec.ts") && !path.endsWith(".spec.tsx"),
      )
      .flatMap(([path, source]) => {
        const matches: string[] = [];
        if (
          path.startsWith("../app/") &&
          appBusinessBypassPattern.test(source)
        ) {
          matches.push(`${path}: app imports feature/entity internals`);
        }
        const publicImport = layerPublicImportPattern.exec(source);
        if (
          publicImport?.[1] &&
          bypassedSegmentPattern.test(`/${publicImport[1]}`) &&
          !indexImportPattern.test(publicImport[1])
        ) {
          matches.push(`${path}: bypasses a layer public API`);
        }
        return matches;
      });

    expect(violations).toEqual([]);
  });
});
