import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const rootConfigFileNames = new Set([
  "eslint.config.cjs",
  "project.json",
  "package.json",
  "tsconfig.json",
  "tsconfig.lib.json",
  "tsconfig.spec.json",
  "vitest.component.config.mts",
  "vitest.config.mts",
]);

export interface CheckLibraryConfigsOptions {
  workspaceRoot?: string;
}

export function runCheckLibraryConfigs(
  options: CheckLibraryConfigsOptions = {},
): number {
  const root = options.workspaceRoot ?? process.cwd();
  const errors: string[] = [];
  const legacyBackendRoot = join(root, "backend");

  if (existsSync(legacyBackendRoot)) {
    errors.push(
      "backend: root backend directory is retired; backend apps live under apps/backend/<scope>/<app> and backend libraries live under libs/backend/**",
    );
  }

  for (const directory of [join(root, "libs")]) {
    if (existsSync(directory)) walk(directory, root, errors);
  }

  if (errors.length > 0) {
    console.error("Library config placement check failed:");

    for (const error of errors) {
      console.error(`- ${error}`);
    }

    return 1;
  }

  console.log("Library config placement check passed.");
  return 0;
}

function walk(directory: string, root: string, errors: string[]): void {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = lstatSync(absolutePath);

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }

      walk(absolutePath, root, errors);
      continue;
    }

    checkFile(absolutePath, root, errors);
  }
}

function checkFile(absolutePath: string, root: string, errors: string[]): void {
  const path = relative(root, absolutePath).split(sep).join("/");
  const segments = path.split("/");
  const fileName = segments.at(-1);

  if (
    segments.includes("oauth") &&
    segments.includes("auth") &&
    !path.startsWith("libs/backend/feature/auth/shared/lib/src/oauth/")
  ) {
    errors.push(
      `${path}: auth OAuth code must live in libs/backend/feature/auth/shared/lib/src/oauth`,
    );
  }

  if (
    fileName !== undefined &&
    rootConfigFileNames.has(fileName) &&
    !isAllowedLibraryConfigPath(segments)
  ) {
    errors.push(
      `${path}: library config file must be inside a library root such as libs/backend/feature/<scope>/<layer>/lib or libs/<scope>/<name>/lib`,
    );
  }

  if (
    fileName !== undefined &&
    fileName.startsWith("eslint.config.") &&
    /["']@nx\/enforce-module-boundaries["']\s*:\s*(?:["']off["']|0|\[\s*(?:["']off["']|0))/u.exec(
      readFileSync(absolutePath, "utf8"),
    ) !== null
  ) {
    errors.push(
      `${path}: do not disable @nx/enforce-module-boundaries in library ESLint config`,
    );
  }

  const storybookIndex = segments.indexOf(".storybook");

  if (storybookIndex >= 0 && !isAllowedStorybookPath(segments, storybookIndex)) {
    errors.push(
      `${path}: library Storybook config must be inside a library root such as libs/backend/feature/<scope>/<layer>/lib or libs/<scope>/<name>/lib`,
    );
  }
}

function isAllowedLibraryConfigPath(segments: string[]): boolean {
  return segments[0] === "libs" && segments.at(-2) === "lib";
}

function isAllowedStorybookPath(
  segments: string[],
  storybookIndex: number,
): boolean {
  return segments[0] === "libs" && segments.at(storybookIndex - 1) === "lib";
}
