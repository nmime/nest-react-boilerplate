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

  // package.json
  tree.write(`${dir}/package.json`, JSON.stringify({
    name: `@app/${projectName}`,
    version: "0.0.0",
    private: true,
    main: "./src/main.ts",
    types: "./src/main.ts",
    scripts: { test: "vitest run", typecheck: "tsc --noEmit" },
    dependencies: {
      "@nestjs/common": "^11.0.0",
      "@nestjs/core": "^11.0.0",
      "@nestjs/platform-express": "^11.0.0",
      "reflect-metadata": "^0.2.2",
      "rxjs": "^7.8.1",
    },
    devDependencies: {
      "@nestjs/schematics": "^11.0.0",
      "@nestjs/testing": "^11.0.0",
      "@types/node": "^22.0.0",
      "typescript": "^5.7.0",
      "vitest": "^3.0.0",
    },
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

  // src/main.ts
  tree.write(`${srcRoot}/main.ts`,
`import { NestFactory } from "@nestjs/core";
import { ${names.pascal}Module } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(${names.pascal}Module);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`);

  // src/app.module.ts
  tree.write(`${srcRoot}/app.module.ts`,
`import { Module } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class ${names.pascal}Module {}
`);

  // src/app.module.spec.ts
  tree.write(`${srcRoot}/app.module.spec.ts`,
`import { Test } from "@nestjs/testing";
import { ${names.pascal}Module } from "./app.module";

describe("${names.pascal}Module", () => {
  it("should be defined", () => {
    expect(${names.pascal}Module).toBeDefined();
  });

  it("should be valid", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [${names.pascal}Module],
    }).compile();
    expect(moduleRef).toBeDefined();
  });
});
`);

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";

export default defineConfig({
  cacheDir: "${d}node_modules/.vitest/${dir}",
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
  },
});
`);

  // eslint.config.cjs
  tree.write(`${dir}/eslint.config.cjs`,
`const baseConfig = require("${d}eslint.config.js");
module.exports = [...baseConfig];
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

  // tsconfig.json — references app+spec
  tree.write(`${dir}/tsconfig.json`, JSON.stringify({
    extends: `${d}tsconfig.base.json`,
    compilerOptions: {
      types: ["vite/client"],
      jsx: "react-jsx",
    },
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
    },
    include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vite.config.mts", "vitest.config.mts"],
  }, null, 2) + "\n");

  // tsconfig.spec.json
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify({
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: `${d}dist/out-tsc/${dir}-spec`,
      types: ["vitest/globals", "vite/client"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "src/**/*.d.ts", "vitest.config.mts"],
  }, null, 2) + "\n");

  // vite.config.mts
  tree.write(`${dir}/vite.config.mts`,
`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig({
  cacheDir: "${d}../../node_modules/.cache/vite",
  root: ".",
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(["*.md"])],
  build: {
    outDir: "${d}../../dist/${dir}",
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
  cacheDir: "${d}../../node_modules/.cache/vitest",
  plugins: [react(), nxViteTsPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.spec.ts", "**/*.test.ts"],
    passWithNoTests: true,
  },
});
`);

  // src/main.tsx
  tree.write(`${srcRoot}/main.tsx`,
`import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
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
