/**
 * Library generator — creates new libraries following repository ownership
 * conventions. Backend common, backend feature, backend PostgreSQL, frontend
 * shared/feature, and common roots are derived from kind, type, and scope.
 *
 * Patterns derived from:
 *   - libs/backend/common/response/lib/{project.json,tsconfig*.json,vitest.config.mts}
 *   - libs/frontend/ui-web/lib/project.json
 */
import type { Tree } from 'nx/src/generators/tree';
import { formatFiles, getProjects } from '@nx/devkit';
import { findAdjacentOwner, validateName, generateNames } from '../names.ts';

// ---------------------------------------------------------------------------

export interface LibraryGeneratorOptions {
  name: string;
  kind: 'backend' | 'frontend' | 'common';
  type?:
    | 'common'
    | 'util'
    | 'ui'
    | 'sdk'
    | 'feature-main'
    | 'feature-admin'
    | 'feature-shared'
    | 'data-access'
    | 'test-util'
    | 'asset';
  scope?: string;
  database?: 'postgres' | 'mongodb';
  /** Concrete responsibility rendered into the local README. */
  description?: string;
  fsdLayer?: 'shared' | 'entities' | 'features' | 'widgets' | 'pages';
  /** Compatibility input rejected at runtime; custom roots violate ownership. */
  directory?: string;
  /** Compatibility input rejected at runtime; custom tags bypass boundaries. */
  tags?: string;
  skipFormat?: boolean;
}

// ---------------------------------------------------------------------------

function findExistingProject(tree: Tree, name: string): string | null {
  const projects = getProjects(tree);
  if (projects.has(name)) {
    return name;
  }
  for (const [projName, config] of projects.entries()) {
    if (config.root?.endsWith(name)) {
      return projName;
    }
  }
  return null;
}

function computeProjectName(
  kind: string,
  name: string,
  type: string,
  scope: string,
  database: 'postgres' | 'mongodb',
): string {
  if (type === 'feature-main' || type === 'feature-admin' || type === 'feature-shared') {
    return `@app/${kind === 'common' ? 'common' : kind}-feature-${scope}-${type.replace('feature-', '')}`;
  }
  if (type === 'data-access') {
    return `@app/backend-${database}-main-${scope}`;
  }
  if (kind === 'backend') {
    return `@app/backend-${name}`;
  }
  if (kind === 'frontend') {
    return `@app/frontend-${name}`;
  }
  return `@app/common-${name}`;
}

function computeDirectory(
  kind: string,
  name: string,
  type: string,
  scope: string,
  database: 'postgres' | 'mongodb',
): string {
  if (kind === 'backend') {
    if (type === 'feature-main') {
      return `libs/backend/feature/${scope}/main/lib`;
    }
    if (type === 'feature-admin') {
      return `libs/backend/feature/${scope}/admin/lib`;
    }
    if (type === 'feature-shared') {
      return `libs/backend/feature/${scope}/shared/lib`;
    }
    if (type === 'data-access') {
      return `libs/backend/${database}/main/${scope}/lib`;
    }
    return `libs/backend/common/${name}/lib`;
  }
  if (kind === 'frontend') {
    if (type === 'feature-main') {
      return `libs/frontend/feature/${scope}/main/lib`;
    }
    if (type === 'feature-shared') {
      return `libs/frontend/feature/${scope}/shared/lib`;
    }
    return `libs/frontend/${name}/lib`;
  }
  return `libs/common/${name}/lib`;
}

function resolveDatabaseProvider(tree: Tree, requested: LibraryGeneratorOptions['database']): 'postgres' | 'mongodb' {
  if (requested !== undefined && requested !== 'postgres' && requested !== 'mongodb') {
    throw new Error(`Unsupported database provider "${String(requested)}". Must be one of: postgres, mongodb`);
  }

  const manifestContents = tree.read('.nrb/workspace.json', 'utf8');
  if (!manifestContents) {
    return requested ?? 'postgres';
  }

  let capabilities: unknown;
  try {
    capabilities = (JSON.parse(manifestContents) as { capabilities?: unknown }).capabilities;
  } catch {
    throw new Error('Cannot resolve database provider: .nrb/workspace.json is not valid JSON.');
  }
  const selected = ['postgres', 'mongodb'].filter(
    (provider) => Array.isArray(capabilities) && capabilities.includes(provider),
  ) as Array<'postgres' | 'mongodb'>;
  if (selected.length !== 1) {
    throw new Error(
      'Cannot resolve database provider: .nrb/workspace.json must select exactly one of postgres or mongodb.',
    );
  }
  if (requested && requested !== selected[0]) {
    throw new Error(
      `Database provider mismatch: requested "${requested}" but .nrb/workspace.json selects "${selected[0]}".`,
    );
  }
  return selected[0] as 'postgres' | 'mongodb';
}

function computeTags(kind: string, type: string, scope: string, fsdLayer: string): string[] {
  if (kind === 'backend') {
    return ['platform:backend', `type:${type}`, `scope:${scope}`];
  }
  if (kind === 'frontend') {
    return ['platform:frontend', `type:${type}`, `scope:${scope}`, `fsd:layer:${fsdLayer}`];
  }
  return ['platform:shared', `type:${type}`, `scope:${scope}`, 'framework:neutral'];
}

function updateTsconfigAlias(tree: Tree, alias: string, sourcePath: string): void {
  const contents = tree.read('tsconfig.base.json', 'utf8');
  if (!contents) {
    return;
  }

  const tsconfig = JSON.parse(contents) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  const compilerOptions = (tsconfig.compilerOptions ??= {});
  const paths = (compilerOptions.paths ??= {});
  if (paths[alias]) {
    throw new Error(`Tsconfig alias "${alias}" already exists.`);
  }
  paths[alias] = [sourcePath];
  tree.write('tsconfig.base.json', `${JSON.stringify(tsconfig, null, 2)}\n`);
}

function libDepth(dir: string): number {
  return dir.split('/').length;
}

function dots(dir: string): string {
  return '../'.repeat(libDepth(dir));
}

function resolveDescription(
  description: string | undefined,
  names: ReturnType<typeof generateNames>,
  kind: LibraryGeneratorOptions['kind'],
  type: NonNullable<LibraryGeneratorOptions['type']>,
): string {
  const normalized = description?.trim();
  if (!normalized) {
    return `${names.title} owns the public ${type} boundary for ${kind} consumers through its src/index.ts entry point.`;
  }
  if (/[\r\n]/u.test(normalized) || normalized.length < 40 || normalized.split(/\s+/u).length < 6) {
    throw new Error('Library description must be a single concrete sentence of at least 40 characters and six words.');
  }
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
}

// ---------------------------------------------------------------------------

/**
 * Generate a backend or common library skeleton on the tree.
 * Uses CommonJS module system and @nx/js:tsc executor.
 */
function createNodeLib(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  projectName: string,
  tags: string[],
  description: string,
): void {
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json — matches libs/backend/common/response/lib/project.json
  tree.write(
    `${dir}/project.json`,
    JSON.stringify(
      {
        name: projectName,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot: srcRoot,
        projectType: 'library',
        tags,
        targets: {
          build: {
            executor: '@nx/js:tsc',
            outputs: ['{options.outputPath}'],
            options: {
              outputPath: `dist/${dir}`,
              main: `${srcRoot}/index.ts`,
              tsConfig: `${dir}/tsconfig.lib.json`,
              assets: [],
              rootDir: '.',
            },
          },
          test: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              cwd: dir,
              command: 'vitest run --config vitest.config.mts',
            },
            inputs: ['default', '^production', { externalDependencies: ['vitest'] }],
            outputs: [`{workspaceRoot}/coverage/${dir}`],
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json — extends base, references lib+spec
  tree.write(
    `${dir}/tsconfig.json`,
    JSON.stringify(
      {
        extends: `${d}tsconfig.base.json`,
        compilerOptions: { types: ['node'] },
        include: [],
        references: [{ path: './tsconfig.lib.json' }, { path: './tsconfig.spec.json' }],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.lib.json — extends ./tsconfig.json (NOT base), with declaration
  tree.write(
    `${dir}/tsconfig.lib.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}`,
          types: ['node'],
          declaration: true,
        },
        exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.spec.json
  tree.write(
    `${dir}/tsconfig.spec.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}-spec`,
          types: ['node', 'vitest'],
        },
        include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  // src/index.ts
  tree.write(
    `${srcRoot}/index.ts`,
    `export const ${names.camel}Version = "0.0.0";
`,
  );

  // src/index.spec.ts
  tree.write(
    `${srcRoot}/index.spec.ts`,
    `import { describe, it, expect } from "vitest";
import { ${names.camel}Version } from "./index";

describe("${names.pascal}Library", () => {
  it("should export a version", () => {
    expect(${names.camel}Version).toBeDefined();
    expect(typeof ${names.camel}Version).toBe("string");
  });
});
`,
  );

  // vitest.config.mts
  tree.write(
    `${dir}/vitest.config.mts`,
    `/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { fullCoverage } from "${d}packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir:
    "${d}node_modules/.vitest/${dir}",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "coverage/${dir}",
      ["src/**/*.ts"],
      [],
    ),
  },
});
`,
  );

  // eslint.config.cjs
  tree.write(
    `${dir}/eslint.config.cjs`,
    `const baseConfig = require("${d}eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
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
`,
  );

  // AGENTS.md
  tree.write(
    `${dir}/AGENTS.md`,
    `# ${projectName} Instructions

Follow the root [AGENTS.md](${d}AGENTS.md) and detailed [AI agent policy](${d}docs/ai/agent-policy.md) first.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in \`libs/backend/package.json\`.
- Respect the scope and boundary tags declared in \`project.json\`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
`,
  );

  // README.md
  tree.write(
    `${dir}/README.md`,
    `# ${projectName}

## Purpose

${description}

## Commands

\`\`\`bash
pnpm exec nx run ${projectName}:test
pnpm exec nx run ${projectName}:build
\`\`\`
`,
  );
}

// ---------------------------------------------------------------------------

/**
 * Generate a frontend library skeleton on the tree.
 * Uses ES modules, React, and Vite-based build.
 */
function createFrontendLib(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  projectName: string,
  tags: string[],
  type: string,
  description: string,
): void {
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json
  tree.write(
    `${dir}/project.json`,
    JSON.stringify(
      {
        name: projectName,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot: srcRoot,
        projectType: 'library',
        tags,
        targets: {
          build: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              cwd: dir,
              command: `node ${d}node_modules/typescript/bin/tsc --noEmit --project tsconfig.lib.json`,
            },
            outputs: [],
          },
          test: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              cwd: dir,
              command: 'vitest run --config vitest.config.mts',
            },
            inputs: ['default', '^production', { externalDependencies: ['vitest'] }],
            outputs: [`{workspaceRoot}/coverage/${dir}`],
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json
  tree.write(
    `${dir}/tsconfig.json`,
    JSON.stringify(
      {
        extends: `${d}tsconfig.base.json`,
        compilerOptions: {
          types: ['vite/client'],
          jsx: 'react-jsx',
        },
        include: [],
        references: [{ path: './tsconfig.lib.json' }, { path: './tsconfig.spec.json' }],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.lib.json
  tree.write(
    `${dir}/tsconfig.lib.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}`,
          types: ['vite/client'],
          declaration: true,
        },
        exclude: ['**/*.spec.ts', '**/*.test.ts', 'vitest.config.mts'],
        include: ['src/**/*.ts', 'src/**/*.tsx'],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.spec.json
  tree.write(
    `${dir}/tsconfig.spec.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}-spec`,
          types: ['vitest/globals', 'vite/client'],
        },
        include: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx', 'vitest.config.mts'],
      },
      null,
      2,
    ) + '\n',
  );

  const rendersReact = type === 'ui' || type === 'feature-main';
  if (rendersReact) {
    tree.write(`${srcRoot}/index.ts`, `export * from "./${names.kebab}.component";\n`);
    tree.write(
      `${srcRoot}/${names.kebab}.component.tsx`,
      `import type { ReactNode } from "react";

export interface ${names.pascal}ComponentProps {
  children: ReactNode;
}

export function ${names.pascal}Component({ children }: ${names.pascal}ComponentProps) {
  return <section>{children}</section>;
}
`,
    );
    tree.write(
      `${srcRoot}/index.spec.tsx`,
      `import { describe, expect, it } from "vitest";
import { ${names.pascal}Component } from "./${names.kebab}.component";

describe("${names.pascal}Component", () => {
  it("exports the React boundary", () => {
    expect(${names.pascal}Component).toBeDefined();
  });
});
`,
    );
  } else {
    tree.write(`${srcRoot}/index.ts`, `export const ${names.camel}LibraryId = "${projectName}" as const;\n`);
    tree.write(
      `${srcRoot}/index.spec.ts`,
      `import { describe, expect, it } from "vitest";
import { ${names.camel}LibraryId } from "./index";

describe("${names.pascal} library boundary", () => {
  it("exports a stable identifier", () => {
    expect(${names.camel}LibraryId).toBe("${projectName}");
  });
});
`,
    );
  }

  // vitest.config.mts
  tree.write(
    `${dir}/vitest.config.mts`,
    `/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { workspaceTsconfigAliases } from "${d}config/vite/workspace-tsconfig-aliases.mjs";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  plugins: [react()],
  cacheDir:
    "${d}node_modules/.vitest/${dir}",
  test: {
    environment: "happy-dom",
    include: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.spec.tsx", "src/**/*.test.tsx"],
    globals: false,
  },
});
`,
  );

  // eslint.config.cjs
  tree.write(
    `${dir}/eslint.config.cjs`,
    `const baseConfig = require("${d}eslint.config.js");

module.exports = [
  {
    ignores: [
      "eslint.config.cjs",
      "project.json",
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
`,
  );

  // AGENTS.md
  tree.write(
    `${dir}/AGENTS.md`,
    `# ${projectName} Instructions

Follow the root [AGENTS.md](${d}AGENTS.md) and detailed [AI agent policy](${d}docs/ai/agent-policy.md) first.

## Local Rules

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Respect the scope and boundary tags declared in \`project.json\`; do not copy their values into local instructions.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for the library purpose and verification commands.
`,
  );

  // README.md
  tree.write(
    `${dir}/README.md`,
    `# ${projectName}

## Purpose

${description}

## Commands

\`\`\`bash
pnpm exec nx run ${projectName}:test
pnpm exec nx run ${projectName}:build
\`\`\`
`,
  );
}

// ---------------------------------------------------------------------------

export async function libraryGenerator(tree: Tree, options: LibraryGeneratorOptions): Promise<void> {
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  const validKinds = ['backend', 'frontend', 'common'];
  if (!validKinds.includes(options.kind)) {
    throw new Error(`Unsupported library kind "${options.kind}". Must be one of: ${validKinds.join(', ')}`);
  }

  const type = options.type ?? 'common';
  const validTypes = [
    'common',
    'util',
    'ui',
    'sdk',
    'feature-main',
    'feature-admin',
    'feature-shared',
    'data-access',
    'test-util',
    'asset',
  ];
  if (!validTypes.includes(type)) {
    throw new Error(`Unsupported library type "${type}". Must be one of: ${validTypes.join(', ')}`);
  }
  if (type === 'data-access' && options.kind !== 'backend') {
    throw new Error('The data-access library type is backend-only.');
  }
  if (type === 'feature-admin' && options.kind !== 'backend') {
    throw new Error('The feature-admin library type is backend-only.');
  }
  if ((type === 'ui' || type === 'asset') && options.kind === 'backend') {
    throw new Error(`The ${type} library type cannot target the backend platform.`);
  }
  if (
    options.kind === 'common' &&
    ['ui', 'feature-main', 'feature-admin', 'feature-shared', 'data-access'].includes(type)
  ) {
    throw new Error(`The ${type} library type must target the frontend or backend platform.`);
  }
  if (options.database !== undefined && type !== 'data-access') {
    throw new Error('--database is supported only for backend data-access libraries.');
  }

  const names = generateNames(options.name);
  if (options.directory) {
    throw new Error('Custom library directories are disabled; choose kind, type, and scope for the canonical root.');
  }
  if (options.tags) {
    throw new Error('Custom library tags are disabled; ownership tags are derived from kind, type, scope, and layer.');
  }
  const [inferredScope] = names.kebab.split('-');
  const scope = options.scope?.trim() || inferredScope || names.kebab;
  const fsdLayer = options.fsdLayer ?? (type === 'feature-main' ? 'features' : 'shared');
  const database = type === 'data-access' ? resolveDatabaseProvider(tree, options.database) : 'postgres';
  const projectName = computeProjectName(options.kind, names.kebab, type, scope, database);
  const dir = computeDirectory(options.kind, names.kebab, type, scope, database);
  const tags = computeTags(options.kind, type, scope, fsdLayer);
  const description = resolveDescription(options.description, names, options.kind, type);

  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(`Library "${existing}" already exists. Choose a different name.`);
  }
  if (type === 'data-access') {
    const otherDatabase = database === 'postgres' ? 'mongodb' : 'postgres';
    const otherProject = `@app/backend-${otherDatabase}-main-${scope}`;
    const otherRoot = `libs/backend/${otherDatabase}/main/${scope}/lib`;
    const tsconfigContents = tree.read('tsconfig.base.json', 'utf8');
    const paths = tsconfigContents
      ? ((JSON.parse(tsconfigContents) as { compilerOptions?: { paths?: Record<string, string[]> } }).compilerOptions
          ?.paths ?? {})
      : {};
    if (findExistingProject(tree, otherProject) || tree.exists(`${otherRoot}/project.json`) || paths[otherProject]) {
      throw new Error(
        `Database provider collision: scope "${scope}" already has ${otherDatabase} data-access ownership at ${otherRoot}.`,
      );
    }
  }

  const projects = getProjects(tree);
  const adjacentOwner = findAdjacentOwner(
    names.kebab,
    [...projects.entries()]
      .filter(([, config]) => config.projectType === 'library')
      .map(([name, config]) => ({ name, root: config.root })),
  );
  if (adjacentOwner) {
    throw new Error(
      `Refusing adjacent library "${names.kebab}" beside existing owner "${adjacentOwner}". Modify the existing owner in place.`,
    );
  }

  switch (options.kind) {
    case 'backend':
      createNodeLib(tree, names, dir, projectName, tags, description);
      break;
    case 'common':
      createNodeLib(tree, names, dir, projectName, tags, description);
      break;
    case 'frontend':
      createFrontendLib(tree, names, dir, projectName, tags, type, description);
      break;
  }

  updateTsconfigAlias(tree, projectName, `${dir}/src/index.ts`);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

export default libraryGenerator;
