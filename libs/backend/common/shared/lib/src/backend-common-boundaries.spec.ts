import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface ProjectConfig {
  name: string;
  tags: string[];
}

const expectedProjects = {
  analytics: "boundary:infrastructure-adapter",
  api: "boundary:interface-helper",
  bootstrap: "boundary:interface-helper",
  "component-test": "boundary:test-util",
  exception: "boundary:backend-kernel",
  "feature-flags": "boundary:interface-helper",
  format: "boundary:interface-helper",
  health: "boundary:interface-helper",
  intl: "boundary:interface-helper",
  logger: "boundary:infrastructure-adapter",
  nats: "boundary:infrastructure-adapter",
  network: "boundary:backend-kernel",
  otel: "boundary:infrastructure-adapter",
  redis: "boundary:infrastructure-adapter",
  response: "boundary:interface-helper",
  s3: "boundary:infrastructure-adapter",
  shared: "boundary:backend-kernel",
  static: "boundary:infrastructure-adapter",
  swagger: "boundary:interface-helper",
  test: "boundary:test-util",
  validation: "boundary:interface-helper",
} as const;

const forbiddenImports = [
  ["@app", "backend", "feature"].join("/"),
  ["@app", "backend", "postgres"].join("/"),
  ["@app", "backend", "bots"].join("/"),
  ["@app", "frontend"].join("/"),
  ["libs", "backend", "feature"].join("/"),
  ["libs", "backend", "postgres"].join("/"),
  ["libs", "backend", "bots"].join("/"),
  ["libs", "frontend"].join("/"),
];

const importSpecifierPattern =
  /\b(?:from\s+|import\s*\(\s*)["'](?<specifier>[^"']+)["']/gu;

describe("backend common clean boundaries", () => {
  const commonRoot = resolve(process.cwd(), "../..");

  it("classifies every backend common library with a clean-boundary role", () => {
    for (const [library, boundaryTag] of Object.entries(expectedProjects)) {
      const project = readProjectConfig(commonRoot, library);

      expect(project.name).toBe(`@app/backend/common/${library}`);
      expect(project.tags).toEqual(
        expect.arrayContaining([
          "platform:backend",
          "scope:shared",
          boundaryTag,
        ]),
      );
    }
  });

  it("keeps backend common free of feature, persistence, bot, and frontend imports", () => {
    const violations = listTypeScriptFiles(commonRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      const imports = Array.from(source.matchAll(importSpecifierPattern)).map(
        (match) => match.groups?.specifier ?? "",
      );

      return imports.flatMap((specifier) =>
        forbiddenImports
          .filter((importPath) => specifier.startsWith(importPath))
          .map((importPath) => `${filePath}: ${importPath}`),
      );
    });

    expect(violations).toEqual([]);
  });
});

function readProjectConfig(commonRoot: string, library: string): ProjectConfig {
  const projectJsonPath = join(commonRoot, library, "lib", "project.json");
  return JSON.parse(readFileSync(projectJsonPath, "utf8")) as ProjectConfig;
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}
