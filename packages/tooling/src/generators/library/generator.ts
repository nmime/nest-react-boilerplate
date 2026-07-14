/**
 * Library generator — creates new libraries following exact repository conventions.
 *
 * Backend libs: libs/backend/<name>/lib/
 * Frontend libs: libs/frontend/<name>/lib/
 * Common libs: libs/common/<name>/lib/
 *
 * Patterns derived from:
 *   - libs/backend/common/response/lib/{project.json,tsconfig*.json,vitest.config.mts}
 *   - libs/frontend/ui/lib/project.json
 */
import type { Tree } from 'nx/src/generators/tree';
import { formatFiles, getProjects } from '@nx/devkit';
import { validateName, generateNames } from '../names.ts';

// ---------------------------------------------------------------------------

export interface LibraryGeneratorOptions {
  name: string;
  kind: 'backend' | 'frontend' | 'common';
  type?: 'common' | 'util' | 'ui' | 'sdk' | 'feature-main' | 'feature-shared' | 'data-access' | 'test-util' | 'asset';
  scope?: string;
  fsdLayer?: 'shared' | 'entities' | 'features' | 'widgets' | 'pages';
  directory?: string;
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

function computeProjectName(kind: string, name: string, type: string, scope: string): string {
  if (type === 'feature-main' || type === 'feature-shared') {
    return `@app/${kind === 'common' ? 'common' : kind}-feature-${scope}-${type.replace('feature-', '')}`;
  }
  if (type === 'data-access') {
    return `@app/backend-postgres-main-${scope}`;
  }
  if (kind === 'backend') {
    return `@app/backend-${name}`;
  }
  if (kind === 'frontend') {
    return `@app/frontend-${name}`;
  }
  return `@app/common-${name}`;
}

function computeDirectory(kind: string, name: string, type: string, scope: string): string {
  if (kind === 'backend') {
    if (type === 'feature-main') {
      return `libs/backend/feature/${scope}/main/lib`;
    }
    if (type === 'feature-shared') {
      return `libs/backend/feature/${scope}/shared/lib`;
    }
    if (type === 'data-access') {
      return `libs/backend/postgres/main/${scope}/lib`;
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
      "${d}coverage/${dir}",
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

This is the local policy adapter for \`${projectName}\` at \`${dir}\`.
Project type: \`library\`.
Tags: ${tags.map((t) => `\`${t}\``).join(', ')}.\n
## Local Rules

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Do not import frontend libraries from backend code. Shared backend dependencies belong in \`libs/backend/package.json\`.
- Respect the declared scope tag: \`${tags.find((t) => t.startsWith('scope:'))?.replace('scope:', '') ?? names.kebab}\`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
`,
  );

  // README.md
  tree.write(
    `${dir}/README.md`,
    `# ${projectName}

Path: \`${dir}\`
Nx project: \`${projectName}\`
Project type: \`library\`
Tags: ${tags.map((t) => `\`${t}\``).join(', ')}

## Purpose

${names.title} library.

## Ownership

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Do not import frontend libraries from backend code.
- Respect the declared scope tag: \`${tags.find((t) => t.startsWith('scope:'))?.replace('scope:', '') ?? names.kebab}\`.

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

This is the local policy adapter for \`${projectName}\` at \`${dir}\`.
Project type: \`library\`.
Tags: ${tags.map((t) => `\`${t}\``).join(', ')}.\n
## Local Rules

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Respect the declared scope tag: \`${tags.find((t) => t.startsWith('scope:'))?.replace('scope:', '') ?? names.kebab}\`.
- Keep this file short; put setup details and command lists in the local README.

See [README.md](./README.md) for project commands and ownership notes.
`,
  );

  // README.md
  tree.write(
    `${dir}/README.md`,
    `# ${projectName}

Path: \`${dir}\`
Nx project: \`${projectName}\`
Project type: \`library\`
Tags: ${tags.map((t) => `\`${t}\``).join(', ')}

## Purpose

${names.title} library.

## Ownership

- Keep the public API behind this library boundary and prefer exports through \`src/index.ts\` when present.
- Respect the declared scope tag: \`${tags.find((t) => t.startsWith('scope:'))?.replace('scope:', '') ?? names.kebab}\`.

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
  if ((type === 'ui' || type === 'asset') && options.kind === 'backend') {
    throw new Error(`The ${type} library type cannot target the backend platform.`);
  }
  if (options.kind === 'common' && ['ui', 'feature-main', 'feature-shared', 'data-access'].includes(type)) {
    throw new Error(`The ${type} library type must target the frontend or backend platform.`);
  }

  const names = generateNames(options.name);
  const [inferredScope] = names.kebab.split('-');
  const scope = options.scope?.trim() || inferredScope || names.kebab;
  const fsdLayer = options.fsdLayer ?? (type === 'feature-main' ? 'features' : 'shared');
  const projectName = computeProjectName(options.kind, names.kebab, type, scope);
  const dir = options.directory ?? computeDirectory(options.kind, names.kebab, type, scope);
  const tags = options.tags
    ? options.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : computeTags(options.kind, type, scope, fsdLayer);

  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(`Library "${existing}" already exists. Choose a different name.`);
  }

  switch (options.kind) {
    case 'backend':
      createNodeLib(tree, names, dir, projectName, tags);
      break;
    case 'common':
      createNodeLib(tree, names, dir, projectName, tags);
      break;
    case 'frontend':
      createFrontendLib(tree, names, dir, projectName, tags, type);
      break;
  }

  updateTsconfigAlias(tree, projectName, `${dir}/src/index.ts`);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

export default libraryGenerator;
