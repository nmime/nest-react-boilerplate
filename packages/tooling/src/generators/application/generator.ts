/**
 * Application generator — creates new applications following repository
 * conventions for frontend and backend kinds.
 *
 * Creates valid repository-convention skeletons:
 *   - project.json with proper targets
 *   - package.json with workspace dependencies
 *   - tsconfig files (app, spec, root)
 *   - source directory structure
 *   - test infrastructure
 *
 * Backend apps use @nx/js:tsc executor; frontend apps use Vite.
 */
import type { Tree } from "nx/src/generators/tree";
import {
  formatFiles,
  getProjects,
} from "@nx/devkit";
import { validateName, generateNames } from "../names.js";

// ---------------------------------------------------------------------------

export interface ApplicationGeneratorOptions {
  name: string;
  kind: "frontend" | "backend";
  directory?: string;
  tags?: string;
  skipFormat?: boolean;
}

// ---------------------------------------------------------------------------

/**
 * Check if an application with the given name already exists.
 */
function findExistingProject(tree: Tree, name: string): string | null {
  const projects = getProjects(tree);
  if (projects.has(name)) {
    return name;
  }
  // Also check by directory path
  for (const [projName, config] of projects.entries()) {
    if (config.root.endsWith(name)) {
      return projName;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Compute the default directory for an application.
 */
function computeAppDirectory(kind: string, name: string): string {
  const scope = name.split("-")[0];
  if (kind === "backend") {
    return `apps/backend/${scope}/${name}`;
  }
  return `apps/frontend/${name}`;
}

/**
 * Compute default tags for an application.
 */
function computeAppTags(kind: string, name: string): string[] {
  const scope = name.split("-")[0];
  if (kind === "backend") {
    return ["platform:backend", "type:backend-app", `scope:${scope}`];
  }
  return ["platform:frontend", "type:frontend-app", `scope:${scope}`, "fsd:layer:app"];
}

// ---------------------------------------------------------------------------

/** Generate backend application skeleton files */
function generateBackendAppFiles(name: string, dir: string, tags: string[]): void {
  // This function will be called within the generator with tree available
}

/**
 * Generate a backend application skeleton on the tree.
 */
function createBackendApp(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, tags: string[]): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;

  // project.json
  const projectJson = {
    name: projectName,
    $schema: "../../node_modules/nx/schemas/project-schema.json",
    sourceRoot: srcRoot,
    projectType: "application",
    tags,
    targets: {
      build: {
        executor: "@nx/js:tsc",
        outputs: ["{options.outputPath}"],
        options: {
          outputPath: `dist/${dir}`,
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
        outputs: [`{workspaceRoot}/coverage/${dir}`],
      },
      typecheck: {
        executor: "nx:run-commands",
        cache: true,
        options: {
          cwd: dir,
          command: "tsc --noEmit -p tsconfig.app.json",
        },
        inputs: ["default", { externalDependencies: ["typescript"] }],
      },
    },
  };
  tree.write(`${dir}/project.json`, JSON.stringify(projectJson, null, 2) + "\n");

  // package.json
  const packageJson = {
    name: `@app/${projectName}`,
    version: "0.0.0",
    private: true,
    main: "./src/main.ts",
    types: "./src/main.ts",
    scripts: {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
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
  };
  tree.write(`${dir}/package.json`, JSON.stringify(packageJson, null, 2) + "\n");

  // tsconfig.json (root for app)
  const tsconfig = {
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      target: "ES2022",
      module: "commonjs",
      moduleResolution: "bundler",
      forceConsistentCasingInFileNames: true,
      strict: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      noEmit: true,
      declaration: false,
      inlineSources: false,
      isolatedModules: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      lib: ["es2022"],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      baseUrl: ".",
      paths: {},
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.spec.json" },
    ],
  };
  tree.write(`${dir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2) + "\n");

  // tsconfig.app.json
  const tsconfigApp = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../dist/out-tsc",
      types: ["node"],
    },
    include: ["src/**/*.ts"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vite.config.mts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.app.json`, JSON.stringify(tsconfigApp, null, 2) + "\n");

  // tsconfig.spec.json
  const tsconfigSpec = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../dist/out-tsc",
      types: ["vitest/globals", "node"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify(tsconfigSpec, null, 2) + "\n");

  // src/main.ts
  tree.write(`${srcRoot}/main.ts`,
`import { NestFactory } from "@nestjs/core";
import { ${names.pascal}Module } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(${names.pascal}Module);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`
  );

  // src/app.module.ts
  tree.write(`${srcRoot}/app.module.ts`,
`import { Module } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class ${names.pascal}Module {}
`
  );

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
`
  );

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "../../node_modules/.cache/vitest",
  plugins: [nxViteTsPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.spec.ts", "**/*.test.ts"],
    passWithNoTests: true,
  },
});
`
  );

  // eslint.config.cjs
  tree.write(`${dir}/eslint.config.cjs`,
`const { FlatCompat } = require("@eslint/eslintrc");
const nx = require("@nx/eslint-plugin");
const baseConfig = require("../../eslint.config.js");

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  ...baseConfig,
  ...nx.configs.flat["typescript-recommended"],
  {
    ignores: ["**/*.spec.ts", "**/*.test.ts"],
  },
];
`
  );
}

/**
 * Generate a frontend application skeleton on the tree.
 */
function createFrontendApp(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, tags: string[]): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;

  // project.json
  const projectJson = {
    name: projectName,
    $schema: "../../node_modules/nx/schemas/project-schema.json",
    sourceRoot: srcRoot,
    projectType: "application",
    tags,
    targets: {
      build: {
        executor: "@nx/vite:build",
        outputs: ["{options.outputPath}"],
        defaultConfiguration: "production",
        options: {
          outputPath: `dist/${dir}`,
        },
        configurations: {
          development: { mode: "development" },
          production: { mode: "production" },
        },
      },
      serve: {
        executor: "@nx/vite:dev-server",
        defaultConfiguration: "development",
        options: {
          buildTarget: `${projectName}:build`,
        },
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
      typecheck: {
        executor: "nx:run-commands",
        cache: true,
        options: {
          cwd: dir,
          command: "tsc --noEmit -p tsconfig.app.json",
        },
        inputs: ["default", { externalDependencies: ["typescript"] }],
      },
    },
  };
  tree.write(`${dir}/project.json`, JSON.stringify(projectJson, null, 2) + "\n");

  // package.json
  const packageJson = {
    name: `@app/${projectName}`,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      "typescript": "^5.7.0",
      "vite": "^6.0.0",
      "vitest": "^3.0.0",
      "@nx/vite": "^23.0.0",
    },
  };
  tree.write(`${dir}/package.json`, JSON.stringify(packageJson, null, 2) + "\n");

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
`
  );

  // tsconfig.json
  const tsconfig = {
    extends: "../../tsconfig.base.json",
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      forceConsistentCasingInFileNames: true,
      strict: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      noEmit: true,
      declaration: false,
      inlineSources: false,
      isolatedModules: true,
      jsx: "react-jsx",
      lib: ["es2022", "dom", "dom.iterable"],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      baseUrl: ".",
      paths: {},
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.spec.json" },
    ],
  };
  tree.write(`${dir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2) + "\n");

  // tsconfig.app.json
  const tsconfigApp = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../dist/out-tsc",
      types: ["vite/client"],
    },
    include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vite.config.mts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.app.json`, JSON.stringify(tsconfigApp, null, 2) + "\n");

  // tsconfig.spec.json
  const tsconfigSpec = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../dist/out-tsc",
      types: ["vitest/globals", "vite/client"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "src/**/*.d.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify(tsconfigSpec, null, 2) + "\n");

  // vite.config.mts
  tree.write(`${dir}/vite.config.mts`,
`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig({
  cacheDir: "../../node_modules/.cache/vite",
  root: ".",
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(["*.md"])],
  build: {
    outDir: "../../dist/${dir}",
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.spec.ts", "**/*.test.ts"],
    passWithNoTests: true,
  },
});
`
  );

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "../../node_modules/.cache/vitest",
  plugins: [react(), nxViteTsPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.spec.ts", "**/*.test.ts"],
    passWithNoTests: true,
  },
});
`
  );

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
`
  );

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
`
  );

  // src/app.spec.tsx
  tree.write(`${srcRoot}/app.spec.tsx`,
`import { describe, it, expect } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("should be defined", () => {
    expect(App).toBeDefined();
  });
});
`
  );

  // public/.gitkeep
  tree.write(`${dir}/public/.gitkeep`, "");

  // eslint.config.cjs
  tree.write(`${dir}/eslint.config.cjs`,
`const baseConfig = require("../../eslint.config.js");

module.exports = [
  ...baseConfig,
];
`
  );
}

// ---------------------------------------------------------------------------

/**
 * Main generator entry point.
 */
export async function applicationGenerator(
  tree: Tree,
  options: ApplicationGeneratorOptions,
): Promise<void> {
  // Validate name
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  const names = generateNames(options.name);
  const projectName = names.kebab;

  // Validate kind
  if (options.kind !== "frontend" && options.kind !== "backend") {
    throw new Error(
      `Unsupported application kind "${options.kind}". Must be "frontend" or "backend".`,
    );
  }

  // Check for duplicate projects
  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(
      `Application "${existing}" already exists. Choose a different name.`,
    );
  }

  // Compute directory and tags
  const dir = options.directory ?? computeAppDirectory(options.kind, names.kebab);
  const tags = options.tags
    ? options.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : computeAppTags(options.kind, names.kebab);

  // Check that the directory doesn't already exist
  if (tree.children(dir.split("/")[0])) {
    const topParts = dir.split("/").slice(0, -1).reduce((path, part) => `${path}/${part}`, "");
    if (tree.exists(dir)) {
      throw new Error(`Directory "${dir}" already exists. Choose a different name or directory.`);
    }
  }

  // Generate files
  if (options.kind === "backend") {
    createBackendApp(tree, names, dir, tags);
  } else {
    createFrontendApp(tree, names, dir, tags);
  }

  // Format unless skipped
  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

// ---------------------------------------------------------------------------

export default applicationGenerator;
