/**
 * Library generator — creates new libraries following repository conventions.
 *
 * Backend libs: libs/backend/<name>/lib/
 * Frontend libs: libs/frontend/<name>/lib/
 * Common libs: libs/common/<name>/lib/
 *
 * Creates valid repository-convention skeletons:
 *   - project.json with proper targets
 *   - package.json with workspace dependencies
 *   - tsconfig files (lib, spec, root)
 *   - source directory with index.ts
 *   - test infrastructure
 */
import type { Tree } from "nx/src/generators/tree";
import {
  formatFiles,
  getProjects,
} from "@nx/devkit";
import { validateName, generateNames } from "../names.js";

// ---------------------------------------------------------------------------

export interface LibraryGeneratorOptions {
  name: string;
  kind: "backend" | "frontend" | "common";
  directory?: string;
  tags?: string;
  skipFormat?: boolean;
}

// ---------------------------------------------------------------------------

/**
 * Check if a library with the given name already exists.
 */
function findExistingProject(tree: Tree, name: string): string | null {
  const projects = getProjects(tree);
  if (projects.has(name)) {
    return name;
  }
  for (const [projName, config] of projects.entries()) {
    if (config.root.endsWith(name)) {
      return projName;
    }
  }
  return null;
}

/**
 * Compute the project name from a library name and kind.
 */
function computeProjectName(kind: string, name: string): string {
  if (kind === "backend") return `@app/backend-${name}`;
  if (kind === "frontend") return `@app/frontend-${name}`;
  return `@app/common-${name}`;
}

/**
 * Compute the default directory for a library.
 */
function computeDirectory(kind: string, name: string): string {
  if (kind === "backend") return `libs/backend/${name}/lib`;
  if (kind === "frontend") return `libs/frontend/${name}/lib`;
  return `libs/common/${name}/lib`;
}

/**
 * Compute default tags for a library.
 */
function computeTags(kind: string, name: string): string[] {
  const scope = name.split("-")[0];
  if (kind === "backend") return ["platform:backend", "type:common", `scope:${scope}`];
  if (kind === "frontend") return ["platform:frontend", "type:common", `scope:${scope}`];
  return ["platform:common", "type:common", `scope:${scope}`];
}

// ---------------------------------------------------------------------------

/**
 * Generate a backend library skeleton on the tree.
 */
function createBackendLib(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, projectName: string, tags: string[]): void {
  const srcRoot = `${dir}/src`;

  // project.json
  const projectJson = {
    name: projectName,
    $schema: "../../../../node_modules/nx/schemas/project-schema.json",
    sourceRoot: srcRoot,
    projectType: "library",
    tags,
    targets: {
      build: {
        executor: "@nx/js:tsc",
        outputs: ["{options.outputPath}"],
        options: {
          outputPath: `dist/${dir}`,
          main: `${srcRoot}/index.ts`,
          tsConfig: `${dir}/tsconfig.lib.json`,
          assets: [],
          rootDir: ".",
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
          command: "tsc --noEmit -p tsconfig.lib.json",
        },
        inputs: ["default", { externalDependencies: ["typescript"] }],
      },
    },
  };
  tree.write(`${dir}/project.json`, JSON.stringify(projectJson, null, 2) + "\n");

  // package.json
  const packageJson = {
    name: projectName,
    version: "0.0.0",
    private: true,
    main: "./src/index.ts",
    types: "./src/index.ts",
    type: "commonjs",
    scripts: {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
    dependencies: {},
    devDependencies: {},
  };
  tree.write(`${dir}/package.json`, JSON.stringify(packageJson, null, 2) + "\n");

  // tsconfig.json
  const tsconfig = {
    extends: "../../../tsconfig.base.json",
    compilerOptions: {
      module: "commonjs",
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
      moduleResolution: "bundler",
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      target: "es2022",
      lib: ["es2022"],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      baseUrl: ".",
      paths: {},
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.lib.json" },
      { path: "./tsconfig.spec.json" },
    ],
  };
  tree.write(`${dir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2) + "\n");

  // tsconfig.lib.json
  const tsconfigLib = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["node"],
    },
    include: ["src/**/*.ts"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.lib.json`, JSON.stringify(tsconfigLib, null, 2) + "\n");

  // tsconfig.spec.json
  const tsconfigSpec = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["vitest/globals", "node"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify(tsconfigSpec, null, 2) + "\n");

  // src/index.ts
  tree.write(`${srcRoot}/index.ts`,
`export const ${names.camel}LibVersion = "0.0.0";
`
  );

  // src/index.spec.ts
  tree.write(`${srcRoot}/index.spec.ts`,
`import { describe, it, expect } from "vitest";
import { ${names.camel}LibVersion } from "./index";

describe("${names.pascal}Library", () => {
  it("should export a version", () => {
    expect(${names.camel}LibVersion).toBeDefined();
    expect(typeof ${names.camel}LibVersion).toBe("string");
  });
});
`
  );

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "../../../../node_modules/.cache/vitest",
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
}

/**
 * Generate a frontend library skeleton on the tree.
 */
function createFrontendLib(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, projectName: string, tags: string[]): void {
  const srcRoot = `${dir}/src`;

  // project.json
  const projectJson = {
    name: projectName,
    $schema: "../../../../node_modules/nx/schemas/project-schema.json",
    sourceRoot: srcRoot,
    projectType: "library",
    tags,
    targets: {
      build: {
        executor: "@nx/vite:build",
        outputs: ["{options.outputPath}"],
        defaultConfiguration: "production",
        options: {
          outputPath: `dist/${dir}`,
          main: `${dir}/package.json`,
          tsConfig: `${dir}/tsconfig.lib.json`,
          assets: [],
        },
        configurations: {
          development: { mode: "development" },
          production: { mode: "production" },
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
          command: "tsc --noEmit -p tsconfig.lib.json",
        },
        inputs: ["default", { externalDependencies: ["typescript"] }],
      },
    },
  };
  tree.write(`${dir}/project.json`, JSON.stringify(projectJson, null, 2) + "\n");

  // package.json
  const packageJson = {
    name: projectName,
    version: "0.0.0",
    private: true,
    main: "./src/index.ts",
    types: "./src/index.ts",
    type: "module",
    scripts: {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
    dependencies: {
      "react": "^19.0.0",
    },
    devDependencies: {},
  };
  tree.write(`${dir}/package.json`, JSON.stringify(packageJson, null, 2) + "\n");

  // tsconfig.json
  const tsconfig = {
    extends: "../../../tsconfig.base.json",
    compilerOptions: {
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
      target: "es2022",
      lib: ["es2022", "dom", "dom.iterable"],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      baseUrl: ".",
      paths: {},
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.lib.json" },
      { path: "./tsconfig.spec.json" },
    ],
  };
  tree.write(`${dir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2) + "\n");

  // tsconfig.lib.json
  const tsconfigLib = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["vite/client"],
    },
    include: ["src/**/*.ts", "src/**/*.tsx"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.lib.json`, JSON.stringify(tsconfigLib, null, 2) + "\n");

  // tsconfig.spec.json
  const tsconfigSpec = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["vitest/globals", "vite/client"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify(tsconfigSpec, null, 2) + "\n");

  // src/index.ts
  tree.write(`${srcRoot}/index.ts`,
`export { ${names.pascal}Component } from "./${names.kebab}.component";
`
  );

  // src/<name>.component.tsx
  tree.write(`${srcRoot}/${names.kebab}.component.tsx`,
`export function ${names.pascal}Component() {
  return (
    <div>
      <p>${names.title} component</p>
    </div>
  );
}
`
  );

  // src/index.spec.tsx
  tree.write(`${srcRoot}/index.spec.tsx`,
`import { describe, it, expect } from "vitest";
import { ${names.pascal}Component } from "./${names.kebab}.component";

describe("${names.pascal}Component", () => {
  it("should be defined", () => {
    expect(${names.pascal}Component).toBeDefined();
  });
});
`
  );

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "../../../../node_modules/.cache/vitest",
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
}

/**
 * Generate a common library skeleton on the tree.
 */
function createCommonLib(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, projectName: string, tags: string[]): void {
  const srcRoot = `${dir}/src`;

  // project.json
  const projectJson = {
    name: projectName,
    $schema: "../../../../node_modules/nx/schemas/project-schema.json",
    sourceRoot: srcRoot,
    projectType: "library",
    tags,
    targets: {
      build: {
        executor: "@nx/js:tsc",
        outputs: ["{options.outputPath}"],
        options: {
          outputPath: `dist/${dir}`,
          main: `${srcRoot}/index.ts`,
          tsConfig: `${dir}/tsconfig.lib.json`,
          assets: [],
          rootDir: ".",
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
          command: "tsc --noEmit -p tsconfig.lib.json",
        },
        inputs: ["default", { externalDependencies: ["typescript"] }],
      },
    },
  };
  tree.write(`${dir}/project.json`, JSON.stringify(projectJson, null, 2) + "\n");

  // package.json
  const packageJson = {
    name: projectName,
    version: "0.0.0",
    private: true,
    main: "./src/index.ts",
    types: "./src/index.ts",
    type: "commonjs",
    scripts: {
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
    dependencies: {},
    devDependencies: {},
  };
  tree.write(`${dir}/package.json`, JSON.stringify(packageJson, null, 2) + "\n");

  // tsconfig.json
  const tsconfig = {
    extends: "../../../tsconfig.base.json",
    compilerOptions: {
      module: "commonjs",
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
      moduleResolution: "bundler",
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      target: "es2022",
      lib: ["es2022"],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      baseUrl: ".",
      paths: {},
    },
    files: [],
    include: [],
    references: [
      { path: "./tsconfig.lib.json" },
      { path: "./tsconfig.spec.json" },
    ],
  };
  tree.write(`${dir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2) + "\n");

  // tsconfig.lib.json
  const tsconfigLib = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["node"],
    },
    include: ["src/**/*.ts"],
    exclude: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.lib.json`, JSON.stringify(tsconfigLib, null, 2) + "\n");

  // tsconfig.spec.json
  const tsconfigSpec = {
    extends: "./tsconfig.json",
    compilerOptions: {
      outDir: "../../../../dist/out-tsc",
      types: ["vitest/globals", "node"],
    },
    include: ["**/*.spec.ts", "**/*.test.ts", "vitest.config.mts"],
  };
  tree.write(`${dir}/tsconfig.spec.json`, JSON.stringify(tsconfigSpec, null, 2) + "\n");

  // src/index.ts
  tree.write(`${srcRoot}/index.ts`,
`export const ${names.camel}LibVersion = "0.0.0";
`
  );

  // src/index.spec.ts
  tree.write(`${srcRoot}/index.spec.ts`,
`import { describe, it, expect } from "vitest";
import { ${names.camel}LibVersion } from "./index";

describe("${names.pascal}Library", () => {
  it("should export a version", () => {
    expect(${names.camel}LibVersion).toBeDefined();
    expect(typeof ${names.camel}LibVersion).toBe("string");
  });
});
`
  );

  // vitest.config.mts
  tree.write(`${dir}/vitest.config.mts`,
`import { defineConfig } from "vitest/config";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  cacheDir: "../../../../node_modules/.cache/vitest",
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
}

// ---------------------------------------------------------------------------

/**
 * Main generator entry point.
 */
export async function libraryGenerator(
  tree: Tree,
  options: LibraryGeneratorOptions,
): Promise<void> {
  // Validate name
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  // Validate kind
  const validKinds = ["backend", "frontend", "common"];
  if (!validKinds.includes(options.kind)) {
    throw new Error(
      `Unsupported library kind "${options.kind}". Must be one of: ${validKinds.join(", ")}`,
    );
  }

  const names = generateNames(options.name);
  const projectName = computeProjectName(options.kind, names.kebab);
  const dir = options.directory ?? computeDirectory(options.kind, names.kebab);
  const tags = options.tags
    ? options.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : computeTags(options.kind, names.kebab);

  // Check for duplicates
  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(
      `Library "${existing}" already exists. Choose a different name.`,
    );
  }

  // Check if directory already exists
  if (tree.exists(dir)) {
    throw new Error(`Directory "${dir}" already exists. Choose a different name or directory.`);
  }

  // Generate files
  switch (options.kind) {
    case "backend":
      createBackendLib(tree, names, dir, projectName, tags);
      break;
    case "frontend":
      createFrontendLib(tree, names, dir, projectName, tags);
      break;
    case "common":
      createCommonLib(tree, names, dir, projectName, tags);
      break;
  }

  // Format unless skipped
  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

// ---------------------------------------------------------------------------

export default libraryGenerator;
