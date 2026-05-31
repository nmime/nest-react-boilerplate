import { readdirSync, statSync } from "node:fs";
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

  walk(join(root, "libs"), root, errors);

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
    const stats = statSync(absolutePath);

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

  if (path.startsWith("libs/feature/auth/oauth/")) {
    errors.push(`${path}: auth OAuth must live in libs/feature/auth/main/lib`);
  }

  if (
    fileName !== undefined &&
    rootConfigFileNames.has(fileName) &&
    segments.at(-2) !== "lib"
  ) {
    errors.push(
      `${path}: library config file must be inside the library lib/ folder`,
    );
  }

  const storybookIndex = segments.indexOf(".storybook");

  if (storybookIndex >= 0 && segments.at(storybookIndex - 1) !== "lib") {
    errors.push(
      `${path}: library Storybook config must be inside the library lib/ folder`,
    );
  }
}
