/**
 * Application generator — creates new applications following exact repository
 * conventions for frontend and backend kinds.
 *
 * Patterns derived from:
 *   - apps/backend/user/user-app-api/project.json
 *   - apps/frontend/app/project.json
 *   - tsconfig layouts across backend apps
 */
import type { Tree } from "nx/src/generators/tree";
import { formatFiles, getProjects } from "@nx/devkit";
import { validateName, generateNames } from "../names.ts";

// ---------------------------------------------------------------------------

export interface ApplicationGeneratorOptions {
  name: string;
  kind: "frontend" | "backend";
  directory?: string;
  tags?: string;
  skipFormat?: boolean;
}

// ---------------------------------------------------------------------------

function findExistingProject(tree: Tree, name: string): string | null {
  const projects = getProjects(tree);
  if (projects.has(name)) return name;
  for (const [projName, config] of projects.entries()) {
    if (config.root?.endsWith(name)) return projName;
  }
  return null;
}

function computeAppDirectory(kind: string, name: string): string {
  const scope = name.split("-")[0];
  if (kind === "backend") return `apps/backend/${scope}/${name}`;
  return `apps/frontend/${name}`;
}

function computeAppTags(kind: string, name: string): string[] {
  const scope = name.split("-")[0];
  if (kind === "backend") return ["platform:backend", "type:backend-app", `scope:${scope}`];
  return ["platform:frontend", "type:frontend-app", `scope:${scope}`, "fsd:layer:app"];
}

function depth(dir: string): number {
  return dir.split("/").length;
}

function dots(dir: string): string {
  return "../".repeat(depth(dir));
}

// ---------------------------------------------------------------------------
// Backend app skeleton
// ---------------------------------------------------------------------------

function createBackendApp(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, tags: string[]): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json — matches apps/backend/user/user-app-api/project.json
  tree.write(`${dir}/project.json`, JSON.stringify({
    name: projectName,
    $schema: `${d}node_modules/nx/schemas/project-schema.json`,
    sourceRoot: srcRoot,
    projectType: "application",
    tags,
    targets: {
      build: {
        executor: "@nx/js:tsc",
        outputs: ["{options.outputPath}"],
        options: {
          outputPath: `dist/apps/backend/${projectName}`,
          main: `${srcRoot}/main.ts`,
          tsConfig: `${dir}/tsconfig.app.json`,
          assets: [],
          generatePackageJson: true,
          updateBuildableProjectDepsInPackageJson: true,
          excludeLibsInPackageJson: true,
          generateLockfile: true,
          rootDir: ".",
        },
      },
      serve: {
        executor: "@nx/js:node",
        defaultConfiguration: "development",
        dependsOn: ["build"],
        options: {
          buildTarget: `${projectName}:build`,
          runBuildTargetDependencies: true,
        },
        configurations: {
          development: { buildTarget: `${projectName}:build:development` },
          production: { buildTarget: `${projectName}:build:production` },
        },
      },
      test: {
        executor: "nx:run-commands",
        cache: true,
        options: {
          cwd: dir,
          command: "vitest run --config vitest.config.mts",
        },
        inputs: ["default", "^production", { externalDependencies: ["vitest"] }],
        outputs: [`{workspaceRoot}/coverage/apps/backend/${projectName}`],
      },
    },
  }, null, 2) + "\n");

  // package.json — matches repo: minimal deps, Nest comes via workspace
  tree.write(`${dir}/package.json`, JSON.stringify({
    name: `@app/${projectName}`,
    version: "0.0.0",
    private: true,
    main: "./src/main.ts",
    types: "./src/main.ts",
    scripts: { test: "vitest run", typecheck: "tsc --noEmit" },
    dependencies: { tslib: "2.8.1" },
    devDependencies: {},
  }, null, 2) + "\n");

  // tsconfig.json — matches repo pattern: extends base, references app+spec
  tree.write(`${dir}/tsconfig.json`, JSON.stringify({
    extends: `${d}tsconfig.base.json`,
    compilerOptions: { types: ["node"] },
    include: [],
    references: [
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.spec.json" },
    ],
  }, null, 2) + "\n");

  // tsconfig.app.json — extends tsconfig.json, not base
  tree.write(`${dir}/tsconfig.app.json`, JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: `${d}dist/out-tsc/${dir}`,
      types: ["node"],
    },
    exclude: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.e2e-spec.ts"],
    include: ["src/**/*.ts"],
  }, null, 2) + "\n");

  // tsconfig.spec.json
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: `${d}dist/out-tsc/${dir}-spec`,
      types: ["node", "vitest"],
    },
    include: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.e2e-spec.ts", "src/**/*.ts"],
  }, null, 2) + "\n");

  // src/main.ts — uses bootstrapNestApi like existing backend apps
  tree.write(`${srcRoot}/main.ts`,
`import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/backend-common-bootstrap";
import { ${names.pascal}Module } from "./${names.kebab}.module";

void bootstrapNestApi(${names.pascal}Module, {
  appName: "${projectName}",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3000,
});
`);

  // src/app.module.ts
  tree.write(`${srcRoot}/${names.kebab}.module.ts`,
`import { Module } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class ${names.pascal}Module {}
`);

  // src/app.module.spec.ts — import from vitest, not globals
  tree.write(`${srcRoot}/${names.kebab}.module.spec.ts`,
`import { describe, it, expect } from "vitest";
import { ${names.pascal}Module } from "./${names.kebab}.module";

describe("${names.pascal}Module", () => {
  it("should be defined", () => {
    expect(${names.pascal}Module).toBeDefined();
  });
});
`);

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { fullCoverage } from "${d}packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "${d}node_modules/.vitest/${dir}",
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.e2e-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "${d}coverage/apps/backend/${projectName}",
      ["src/**/*.ts"],
      [],
    ),
  },
});
`);

  // eslint.config.cjs — matches repo convention with ignores + parserOptions
  tree.write(`${dir}/eslint.config.cjs`,
`const baseConfig = require("${d}eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
      "package.json",
      "tsconfig*.json",
      "vitest.config.mts",
    ],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.*?.json",
      },
    },
  },
];
`);
}

// ---------------------------------------------------------------------------
// Frontend app skeleton
// ---------------------------------------------------------------------------

function createFrontendApp(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, tags: string[]): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json — matches apps/frontend/app/project.json
  tree.write(`${dir}/project.json`, JSON.stringify({
    name: projectName,
    $schema: `${d}node_modules/nx/schemas/project-schema.json`,
    sourceRoot: srcRoot,
    projectType: "application",
    tags,
    targets: {
      build: {
        executor: "@nx/vite:build",
        outputs: ["{options.outputPath}"],
        defaultConfiguration: "production",
        options: { outputPath: `dist/${dir}` },
        configurations: {
          development: { mode: "development" },
          production: { mode: "production" },
        },
      },
      serve: {
        executor: "@nx/vite:dev-server",
        defaultConfiguration: "development",
        options: { buildTarget: `${projectName}:build` },
        configurations: {
          development: { buildTarget: `${projectName}:build:development`, hmr: true },
          production: { buildTarget: `${projectName}:build:production` },
        },
      },
      test: {
        executor: "nx:run-commands",
        cache: true,
        options: {
          cwd: dir,
          command: "vitest run --config vitest.config.mts",
        },
        inputs: ["default", "^production", { externalDependencies: ["vitest"] }],
        outputs: [`{workspaceRoot}/coverage/${dir}`],
      },
    },
  }, null, 2) + "\n");

  // package.json
  tree.write(`${dir}/package.json`, JSON.stringify({
    name: `@app/${projectName}`,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { test: "vitest run", typecheck: "tsc --noEmit" },
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      "typescript": "^5.7.0",
      "vite": "^6.0.0",
      "vitest": "^3.0.0",
    },
  }, null, 2) + "\n");

  // index.html
  tree.write(`${dir}/index.html`,
`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${names.title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

  // tsconfig.json — references app+spec; matches apps/frontend/{admin,app}/tsconfig.json
  tree.write(`${dir}/tsconfig.json`, JSON.stringify({
    extends: `${d}tsconfig.base.json`,
    compilerOptions: {
      jsx: "react-jsx",
      allowJs: false,
      esModuleInterop: false,
      allowSyntheticDefaultImports: true,
      types: ["vite/client"],
      lib: ["es2022", "dom"],
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.spec.json" },
    ],
  }, null, 2) + "\n");

  // tsconfig.app.json
  tree.write(`${dir}/tsconfig.app.json`, JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: `${d}dist/out-tsc/${dir}`,
      types: ["node", "vite/client"],
      module: "esnext",
      moduleResolution: "bundler",
    },
    exclude: [
      "src/**/*.spec.ts", "src/**/*.test.ts",
      "src/**/*.spec.tsx", "src/**/*.test.tsx",
      "src/**/*.spec.js", "src/**/*.test.js",
      "src/**/*.spec.jsx", "src/**/*.test.jsx",
    ],
    include: ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"],
  }, null, 2) + "\n");

  // tsconfig.spec.json
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: `${d}dist/out-tsc/${dir}-spec`,
      module: "esnext",
      moduleResolution: "bundler",
      types: ["vitest", "node", "vite/client"],
    },
    include: [
      "vitest.config.mts",
      "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/**/*.d.ts",
    ],
  }, null, 2) + "\n");

  // vite.config.mts
  tree.write(`${dir}/vite.config.mts`,
`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig({
  cacheDir: "${d}node_modules/.cache/vite",
  root: ".",
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(["*.md"])],
  build: {
    outDir: "${d}dist/${dir}",
    emptyOutDir: true,
    reportCompressedSize: false,
  },
});
`);

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "${d}node_modules/.cache/vitest",
  plugins: [react(), nxViteTsPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
    passWithNoTests: false,
  },
});
`);

  // src/main.tsx
  tree.write(`${srcRoot}/main.tsx`,
`import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Missing required root element with id "root".');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`);

  // src/app.tsx
  tree.write(`${srcRoot}/app.tsx`,
`export function App() {
  return (
    <div>
      <h1>${names.title}</h1>
      <p>Welcome to ${names.title}</p>
    </div>
  );
}
`);

  // src/app.spec.tsx
  tree.write(`${srcRoot}/app.spec.tsx`,
`import { describe, it, expect } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("should be defined", () => {
    expect(App).toBeDefined();
  });
});
`);

  // public/.gitkeep
  tree.write(`${dir}/public/.gitkeep`, "");

  // eslint.config.cjs
  tree.write(`${dir}/eslint.config.cjs`,
`const baseConfig = require("${d}eslint.config.js");
module.exports = [...baseConfig];
`);
}

// ---------------------------------------------------------------------------

export async function applicationGenerator(
  tree: Tree,
  options: ApplicationGeneratorOptions,
): Promise<void> {
  const nameError = validateName(options.name);
  if (nameError) throw new Error(nameError);

  if (options.kind !== "frontend" && options.kind !== "backend") {
    throw new Error(`Unsupported application kind "${options.kind}". Must be "frontend" or "backend".`);
  }

  const names = generateNames(options.name);
  const projectName = names.kebab;

  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(`Application "${existing}" already exists. Choose a different name.`);
  }

  const dir = options.directory ?? computeAppDirectory(options.kind, names.kebab);
  const tags = options.tags
    ? options.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : computeAppTags(options.kind, names.kebab);

  if (options.kind === "backend") {
    createBackendApp(tree, names, dir, tags);
  } else {
    createFrontendApp(tree, names, dir, tags);
  }

  if (!options.skipFormat) await formatFiles(tree);
}

export default applicationGenerator;
