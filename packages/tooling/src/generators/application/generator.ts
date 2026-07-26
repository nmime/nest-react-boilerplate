/**
 * Static generator evidence for REQ-SCAFFOLD-OWNERSHIP-001.
 *
 * Application generator — creates new applications following exact repository
 * conventions for frontend, backend, and end-to-end verification kinds.
 *
 * Canonical roots are apps/backend/<scope>/<name> for backend deployables and
 * apps/frontend/<name> for frontend deployables, and apps/e2e/<name> for
 * verification applications. Runtime-specific files are derived from the
 * selected renderer; identity, tags, and targets stay in project.json.
 */
import type { Tree } from 'nx/src/generators/tree';
import { formatFiles, getProjects } from '@nx/devkit';
import { cloneStyleBaseName, findAdjacentOwner, validateName, generateNames } from '../names.ts';

// ---------------------------------------------------------------------------

// Generated shells start with the repository's canonical locale. Keep this
// generator-owned so the generator can run before workspace path aliases exist.
const defaultLocale = 'en';

export interface ApplicationGeneratorOptions {
  name: string;
  kind: 'frontend' | 'backend' | 'e2e';
  renderer?: 'vite' | 'astro' | 'vike' | 'expo' | 'nest-api' | 'consumer' | 'scheduler' | 'cucumber';
  port?: number;
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

function computeAppDirectory(kind: string, name: string): string {
  const scope = name.split('-')[0];
  if (kind === 'backend') {
    return `apps/backend/${scope}/${name}`;
  }
  if (kind === 'e2e') {
    return `apps/e2e/${name.replace(/-e2e$/u, '')}`;
  }
  return `apps/frontend/${name}`;
}

function computeAppTags(kind: string, name: string): string[] {
  const scope = name.split('-')[0];
  if (kind === 'backend') {
    return ['platform:backend', 'type:backend-app', `scope:${scope}`];
  }
  if (kind === 'e2e') {
    return ['platform:e2e', 'type:e2e', `scope:${name.replace(/-e2e$/u, '')}`];
  }
  return ['platform:frontend', 'type:frontend-app', `scope:${scope}`, 'fsd:layer:app'];
}

function collectUsedAppPorts(tree: Tree): Set<number> {
  const ports = new Set<number>();
  const pending = ['apps'];
  const patterns = [/\bport\s*:\s*(\d{2,5})/giu, /--port(?:=|\s+)(\d{2,5})/giu, /PORT\s*\?\?\s*(\d{2,5})/gu];

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) {
      continue;
    }
    for (const child of tree.children(directory)) {
      const path = `${directory}/${child}`;
      if (!tree.isFile(path)) {
        pending.push(path);
        continue;
      }
      if (!/\.(?:[cm]?[jt]s|json)$/u.test(path)) {
        continue;
      }
      const content = tree.read(path, 'utf8') ?? '';
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of content.matchAll(pattern)) {
          ports.add(Number(match[1]));
        }
      }
    }
  }

  return ports;
}

function nextAvailablePort(kind: 'frontend' | 'backend', usedPorts: ReadonlySet<number>): number {
  let port = kind === 'frontend' ? 4200 : 3100;
  while (usedPorts.has(port) && port < 65535) {
    port += 1;
  }
  if (port > 65535) {
    throw new Error(`No available local ${kind} application port remains.`);
  }
  return port;
}

function depth(dir: string): number {
  return dir.split('/').length;
}

function dots(dir: string): string {
  return '../'.repeat(depth(dir));
}

// ---------------------------------------------------------------------------
// Cucumber acceptance app skeleton
// ---------------------------------------------------------------------------

function createCucumberApp(tree: Tree, names: ReturnType<typeof generateNames>, dir: string, tags: string[]): void {
  const projectName = names.kebab;
  const idStem = names.kebab.replace(/-e2e$/u, '').toUpperCase();
  const requirementId = `REQ-${idStem}-001`;
  const scenarioId = `SCN-${idStem}-01`;
  const d = dots(dir);

  tree.write(
    `${dir}/project.json`,
    `${JSON.stringify(
      {
        name: projectName,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot: `${dir}/src`,
        projectType: 'application',
        tags,
        targets: {
          build: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              command: `tsc --noEmit -p ${dir}/tsconfig.json`,
            },
            inputs: ['default', '^production', { externalDependencies: ['typescript'] }],
          },
          typecheck: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              command: `tsc --noEmit -p ${dir}/tsconfig.json`,
            },
            inputs: ['default', '^production', { externalDependencies: ['typescript'] }],
          },
          test: {
            executor: 'nx:run-commands',
            cache: false,
            options: {
              command: `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js --config ${dir}/cucumber.config.ts`,
            },
            inputs: ['default', '^production', { externalDependencies: ['@cucumber/cucumber'] }],
            outputs: ['{workspaceRoot}/test-results/cucumber', '{workspaceRoot}/cucumber-report'],
          },
          acceptance: {
            executor: 'nx:run-commands',
            cache: false,
            options: {
              command: `node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js --config ${dir}/cucumber.config.ts`,
            },
            inputs: ['default', '^production', { externalDependencies: ['@cucumber/cucumber'] }],
            outputs: ['{workspaceRoot}/test-results/cucumber', '{workspaceRoot}/cucumber-report'],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  tree.write(
    `${dir}/tsconfig.json`,
    `${JSON.stringify(
      {
        extends: `${d}tsconfig.base.json`,
        compilerOptions: {
          allowImportingTsExtensions: true,
          noEmit: true,
          types: ['node'],
        },
        include: ['cucumber.config.ts', 'src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  tree.write(
    `${dir}/package.json`,
    `${JSON.stringify(
      {
        name: projectName,
        private: true,
        type: 'module',
        dependencies: {
          tslib: '2.8.1',
        },
        devDependencies: {
          '@cucumber/cucumber': '13.2.0',
          '@types/node': '24.13.3',
          tsx: '4.23.1',
          typescript: '6.0.3',
        },
      },
      null,
      2,
    )}\n`,
  );
  tree.write(
    `${dir}/cucumber.config.ts`,
    `import type { IConfiguration } from '@cucumber/cucumber';

export default {
  paths: ['${dir}/features/**/*.feature'],
  import: ['${dir}/src/**/*.ts'],
  parallel: 1,
  retry: 0,
  format: [
    'progress',
    'message:test-results/cucumber/messages.ndjson',
    'html:cucumber-report/index.html',
    'junit:test-results/cucumber/junit.xml',
  ],
} satisfies Partial<IConfiguration>;
`,
  );
  tree.write(
    `${dir}/src/support/world.ts`,
    `import {
  setWorldConstructor,
  World,
  type IWorldOptions,
} from '@cucumber/cucumber';

export class AcceptanceWorld extends World {
  observedOutcome: string | undefined;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AcceptanceWorld);
`,
  );
  tree.write(
    `${dir}/src/steps/acceptance.steps.ts`,
    `import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../support/world.ts';

Given('an isolated acceptance scenario', function (this: AcceptanceWorld) {
  assert.equal(this.observedOutcome, undefined);
});

When('the generated acceptance project executes', function (this: AcceptanceWorld) {
  this.observedOutcome = 'verified';
});

Then('the scenario records independently isolated evidence', function (this: AcceptanceWorld) {
  assert.equal(this.observedOutcome, 'verified');
});
`,
  );
  tree.write(
    `${dir}/features/acceptance.feature`,
    `@${requirementId}
Feature: Generated acceptance project

  Rule: Executable examples use isolated scenario state

    @${scenarioId}
    Scenario: Run the generated acceptance contract
      Given an isolated acceptance scenario
      When the generated acceptance project executes
      Then the scenario records independently isolated evidence
`,
  );
  tree.write(
    `${dir}/AGENTS.md`,
    `# ${names.title} E2E instructions

Follow the repository root \`AGENTS.md\` and \`apps/e2e/AGENTS.md\`.

- Keep Gherkin declarative and in product-domain language.
- Give every Rule a stable requirement tag and every Scenario a stable scenario tag.
- Keep World state isolated per scenario and organize step definitions by domain.
- Do not replace Vitest, contract tests, property tests, or Playwright journeys with Cucumber.
`,
  );
  tree.write(
    `${dir}/README.md`,
    `# ${names.title}

Cucumber.js executable acceptance specifications for repository capabilities.

Run:

\`\`\`bash
pnpm exec nx run ${projectName}:acceptance
\`\`\`

Feature files own stakeholder-readable examples. OpenSpec owns normative
requirements, while Vitest, contracts, property tests, Playwright, and runtime
checks remain independent evidence lanes.
`,
  );
}

// ---------------------------------------------------------------------------
// Backend app skeleton
// ---------------------------------------------------------------------------

function createBackendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  renderer: 'nest-api' | 'consumer' | 'scheduler',
  port: number,
): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json — matches apps/backend/user/user-app-api/project.json
  tree.write(
    `${dir}/project.json`,
    JSON.stringify(
      {
        name: projectName,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot: srcRoot,
        projectType: 'application',
        tags,
        targets: {
          build: {
            executor: '@nx/js:tsc',
            outputs: ['{options.outputPath}'],
            options: {
              outputPath: `dist/${dir}`,
              main: `${srcRoot}/main.ts`,
              tsConfig: `${dir}/tsconfig.app.json`,
              assets: [],
              generatePackageJson: true,
              updateBuildableProjectDepsInPackageJson: true,
              excludeLibsInPackageJson: true,
              generateLockfile: true,
              rootDir: '.',
            },
          },
          serve: {
            executor: '@nx/js:node',
            defaultConfiguration: 'development',
            dependsOn: ['build'],
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

  // package.json — matches repo: minimal deps, Nest comes via workspace
  tree.write(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: `@app/${projectName}`,
        version: '0.0.0',
        private: true,
        main: './src/main.ts',
        types: './src/main.ts',
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
        dependencies: { tslib: '2.8.1' },
        devDependencies: {},
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json — matches repo pattern: extends base, references app+spec
  tree.write(
    `${dir}/tsconfig.json`,
    JSON.stringify(
      {
        extends: `${d}tsconfig.base.json`,
        compilerOptions: { types: ['node'] },
        include: [],
        references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.spec.json' }],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.app.json — extends tsconfig.json, not base
  tree.write(
    `${dir}/tsconfig.app.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}`,
          types: ['node'],
        },
        exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.e2e-spec.ts'],
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
        include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.e2e-spec.ts', 'src/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  if (renderer === 'nest-api') {
    tree.write(
      `${srcRoot}/main.ts`,
      `import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/backend-common-bootstrap";
import { ${names.pascal}Module } from "./${names.kebab}.module";

void bootstrapNestApi(${names.pascal}Module, {
  appName: "${projectName}",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  port: Number(process.env.PORT ?? ${port}),
});
`,
    );
  } else {
    tree.write(
      `${srcRoot}/main.ts`,
      `import { NestFactory } from "@nestjs/core";
import { ${names.pascal}Module } from "./${names.kebab}.module";

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(${names.pascal}Module, {
    logger: ["error", "warn", "log"],
  });
  application.enableShutdownHooks();
}

void bootstrap();
`,
    );
  }

  // A generated API includes the repository-standard health surface.
  // Consumers use a minimal application context, while schedulers also own
  // the process-level ScheduleModule bootstrap.
  tree.write(
    `${srcRoot}/${names.kebab}.module.ts`,
    renderer === 'nest-api'
      ? `import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from "@app/backend-common-health";
import { ${names.pascal}HealthServiceProvider } from "./health.config";

@Module({
  imports: [],
  controllers: [BaseHealthController],
  providers: [${names.pascal}HealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class ${names.pascal}Module {}
`
      : renderer === 'scheduler'
        ? `import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

@Module({ imports: [ScheduleModule.forRoot()] })
export class ${names.pascal}Module {}
`
        : `import { Module } from "@nestjs/common";

@Module({})
export class ${names.pascal}Module {}
`,
  );

  if (renderer === 'nest-api') {
    tree.write(
      `${srcRoot}/health.config.ts`,
      `import type { Provider } from "@nestjs/common";
import {
  HealthService,
  RuntimeHealthIndicator,
} from "@app/backend-common-health";

export const ${names.pascal}HealthServiceProvider: Provider = {
  provide: HealthService,
  useFactory: () =>
    new HealthService({
      appName: "${projectName}",
      indicators: [new RuntimeHealthIndicator()],
    }),
};
`,
    );
  }

  // src/app.module.spec.ts — import from vitest, not globals
  tree.write(
    `${srcRoot}/${names.kebab}.module.spec.ts`,
    `import { describe, it, expect } from "vitest";
import { ${names.pascal}Module } from "./${names.kebab}.module";

describe("${names.pascal}Module", () => {
  it("should be defined", () => {
    expect(${names.pascal}Module).toBeDefined();
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
      "coverage/${dir}",
      ["src/**/*.ts"],
      [],
    ),
  },
});
`,
  );

  // eslint.config.cjs — matches repo convention with ignores + parserOptions
  tree.write(
    `${dir}/eslint.config.cjs`,
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
`,
  );

  tree.write(
    `${dir}/AGENTS.md`,
    `# ${projectName} Instructions

Follow the root [AGENTS.md](${d}AGENTS.md), the [backend app rules](${d}apps/backend/AGENTS.md), and the [AI agent policy](${d}docs/ai/agent-policy.md).

- Read the renderer, identity, tags, and targets from \`project.json\`; do not copy those values into local instructions.
- Keep transport and process bootstrap code in this deployable application.
- Put reusable domain logic in \`libs/backend/**\` and cross-runtime contracts in \`libs/common/**\`.
- Import libraries through public aliases from \`tsconfig.base.json\`; do not reach into another project by relative path.
- Preserve the standard health endpoints and private-network guard for HTTP APIs.
`,
  );
  tree.write(
    `${dir}/README.md`,
    `# ${names.title}

Backend deployable scaffold for ${names.title}.

## Verification

\`\`\`bash
pnpm exec nx run ${projectName}:build
pnpm exec nx run ${projectName}:test
pnpm exec nx run ${projectName}:serve
\`\`\`

## Completion contract

This source scaffold is not automatically added to the setup catalog or runtime.
Register its stable ID, classification, dependencies, and enterprise-profile
membership before \`pnpm nrb setup\` can select it; \`pnpm run onboarding:verify\`
fails until every real Nx application is registered. Then complete the applicable
[deployable registration checklist](${d}docs/scaffolding-and-extension.md#application-completion-checklist)
for local Compose, Docker/Helm, ingress, DNS, TLS, and observability before
calling the service production-ready. Keep Nx identity and tags in
\`project.json\`; do not copy them into this README.
`,
  );
}

// ---------------------------------------------------------------------------
// Frontend app skeleton
// ---------------------------------------------------------------------------

function createViteFrontendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  port: number,
): void {
  const projectName = names.kebab;
  const srcRoot = `${dir}/src`;
  const d = dots(dir);

  // project.json — matches apps/frontend/app/project.json
  tree.write(
    `${dir}/project.json`,
    JSON.stringify(
      {
        name: projectName,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot: srcRoot,
        projectType: 'application',
        tags,
        targets: {
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
          typecheck: {
            executor: 'nx:run-commands',
            cache: true,
            options: {
              cwd: dir,
              command: 'tsc --noEmit --project tsconfig.app.json && tsc --noEmit --project tsconfig.spec.json',
            },
            inputs: ['default', '^production', { externalDependencies: ['typescript'] }],
          },
          e2e: {
            executor: 'nx:run-commands',
            cache: false,
            options: {
              command: `VITE_E2E_COVERAGE=true node_modules/.bin/vite build --config ${dir}/vite.config.mts && node packages/tooling/bin/repo-tooling.mjs testing frontend-browser-e2e-coverage --dist dist/${dir} --app-name ${projectName} --contains ${JSON.stringify(names.title)} --coverage-dir coverage/e2e/${dir}`,
            },
            inputs: ['production', { externalDependencies: ['@playwright/test', 'vite-plugin-istanbul'] }],
            outputs: [`{workspaceRoot}/coverage/e2e/${dir}`],
          },
        },
      },
      null,
      2,
    ) + '\n',
  );

  // package.json
  tree.write(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: `@app/${projectName}`,
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
        dependencies: {
          react: runtimePackage(tree, 'react', '19.2.3', 'dependencies'),
          'react-dom': runtimePackage(tree, 'react-dom', '19.2.3', 'dependencies'),
        },
        devDependencies: {
          '@tailwindcss/vite': runtimePackage(tree, '@tailwindcss/vite', '4.3.2'),
          '@types/react': runtimePackage(tree, '@types/react', '19.2.17'),
          '@types/react-dom': runtimePackage(tree, '@types/react-dom', '19.2.3'),
          '@vitejs/plugin-react': runtimePackage(tree, '@vitejs/plugin-react', '6.0.3'),
          typescript: runtimePackage(tree, 'typescript', '6.0.3'),
          vite: runtimePackage(tree, 'vite', '8.1.4'),
          'vite-plugin-istanbul': runtimePackage(tree, 'vite-plugin-istanbul', '9.0.1'),
          vitest: runtimePackage(tree, 'vitest', '4.1.10'),
        },
      },
      null,
      2,
    ) + '\n',
  );

  // index.html
  tree.write(
    `${dir}/index.html`,
    `<!DOCTYPE html>
<html lang="${defaultLocale}">
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
`,
  );

  // tsconfig.json — references app+spec; matches apps/frontend/{admin,app}/tsconfig.json
  tree.write(
    `${dir}/tsconfig.json`,
    JSON.stringify(
      {
        extends: `${d}tsconfig.base.json`,
        compilerOptions: {
          jsx: 'react-jsx',
          allowJs: false,
          esModuleInterop: false,
          allowSyntheticDefaultImports: true,
          types: ['vite/client'],
          lib: ['es2022', 'dom'],
        },
        files: [],
        include: [],
        references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.spec.json' }],
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.app.json
  tree.write(
    `${dir}/tsconfig.app.json`,
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          outDir: `${d}dist/out-tsc/${dir}`,
          types: ['node', 'vite/client'],
          module: 'esnext',
          moduleResolution: 'bundler',
        },
        exclude: [
          'src/**/*.spec.ts',
          'src/**/*.test.ts',
          'src/**/*.spec.tsx',
          'src/**/*.test.tsx',
          'src/**/*.spec.js',
          'src/**/*.test.js',
          'src/**/*.spec.jsx',
          'src/**/*.test.jsx',
        ],
        include: ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx'],
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
          module: 'esnext',
          moduleResolution: 'bundler',
          types: ['vitest', 'node', 'vite/client'],
        },
        include: ['vitest.config.mts', 'src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.d.ts'],
      },
      null,
      2,
    ) + '\n',
  );

  // vite.config.mts
  tree.write(
    `${dir}/vite.config.mts`,
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import istanbul from "vite-plugin-istanbul";

export default defineConfig(() => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === "true";

  return {
    cacheDir: "${d}node_modules/.cache/vite",
    root: import.meta.dirname,
    resolve: { tsconfigPaths: true },
    server: { host: "localhost", port: ${port} },
    preview: { host: "localhost", port: ${port} },
    plugins: [
      tailwindcss(),
      react(),
      ...(isE2eCoverage
        ? [
            istanbul({
              cwd: import.meta.dirname,
              include: "src/**/*.{ts,tsx}",
              exclude: ["src/**/*.spec.*", "src/**/*.test.*"],
              extension: [".ts", ".tsx"],
              requireEnv: false,
              forceBuildInstrument: true,
              generatorOpts: { comments: false },
            }),
          ]
        : []),
    ],
    build: {
      outDir: "${d}dist/${dir}",
      emptyOutDir: true,
      reportCompressedSize: false,
      sourcemap: isE2eCoverage,
    },
  };
});
`,
  );

  // vitest.config.mts
  tree.write(
    `${dir}/vitest.config.mts`,
    `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  cacheDir: "${d}node_modules/.cache/vitest",
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.spec.ts", "**/*.test.ts", "**/*.spec.tsx", "**/*.test.tsx"],
    passWithNoTests: false,
  },
});
`,
  );

  // src/main.tsx
  tree.write(
    `${srcRoot}/main.tsx`,
    `import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { UiErrorBoundary } from "@app/frontend-ui-web";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Missing required root element with id "root".');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <UiErrorBoundary>
      <App />
    </UiErrorBoundary>
  </StrictMode>,
);
`,
  );

  // src/app.tsx
  tree.write(
    `${srcRoot}/app.tsx`,
    `import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useI18n,
} from "@app/frontend-runtime";

function AppShell() {
  const { t } = useI18n();

  return (
    <main>
      <h1>{document.title}</h1>
      <p>{t("common.ready")}</p>
    </main>
  );
}

export function App() {
  return (
    <FrontendStateProvider>
      <FrontendQueryProvider>
        <FrontendI18nProvider>
          <AppShell />
        </FrontendI18nProvider>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
}
`,
  );

  // src/app.spec.tsx
  tree.write(
    `${srcRoot}/app.spec.tsx`,
    `import { describe, it, expect } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("should be defined", () => {
    expect(App).toBeDefined();
  });
});
`,
  );

  // public/.gitkeep
  tree.write(`${dir}/public/.gitkeep`, '');

  // eslint.config.cjs
  tree.write(
    `${dir}/eslint.config.cjs`,
    `const baseConfig = require("${d}eslint.config.js");
module.exports = [...baseConfig];
`,
  );
}

// ---------------------------------------------------------------------------

function runtimePackage(
  tree: Tree,
  name: string,
  fallback: string,
  section: 'dependencies' | 'devDependencies' = 'devDependencies',
): string {
  const rootPackage = tree.read('package.json', 'utf8');
  if (!rootPackage) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rootPackage) as Record<string, Record<string, string> | undefined>;
    return parsed[section]?.[name] ?? parsed.dependencies?.[name] ?? parsed.devDependencies?.[name] ?? fallback;
  } catch {
    return fallback;
  }
}

function writeFrontendPolicy(tree: Tree, names: ReturnType<typeof generateNames>, dir: string): void {
  const d = dots(dir);
  tree.write(
    `${dir}/AGENTS.md`,
    `# ${names.kebab} Instructions

Follow the root [AGENTS.md](${d}AGENTS.md) and [frontend app rules](${d}apps/frontend/AGENTS.md).

- Read the renderer, identity, tags, and targets from \`project.json\`; do not copy those values into local instructions.
- Keep renderer entrypoints and routing in this application.
- Put reusable browser UI, state, and API plumbing in \`libs/frontend/**\`.
- Never import backend aliases from frontend source.
- Run \`pnpm run frontend:fsd:check\` after structural changes.
`,
  );
  tree.write(
    `${dir}/README.md`,
    `# ${names.title}

Frontend deployable scaffold for ${names.title}.

## Verification

\`\`\`bash
pnpm exec nx run ${names.kebab}:build
pnpm exec nx run ${names.kebab}:test
pnpm run frontend:fsd:check
\`\`\`

## Completion contract

This source scaffold is not automatically added to the setup catalog or runtime.
Register its stable ID, classification, dependencies, and enterprise-profile
membership before \`pnpm nrb setup\` can select it; \`pnpm run onboarding:verify\`
fails until every real Nx application is registered. Then complete the applicable
[deployable registration checklist](${d}docs/scaffolding-and-extension.md#application-completion-checklist)
for local Compose, Docker/Helm, ingress, DNS, TLS, API routing, and observability
before calling the application production-ready. Keep Nx identity and tags in
\`project.json\`; do not copy them into this README.
`,
  );
}

function writeRunCommandProject(
  tree: Tree,
  dir: string,
  name: string,
  sourceRoot: string,
  tags: string[],
  commands: { build: string; serve: string; typecheck: string },
): void {
  const d = dots(dir);
  tree.write(
    `${dir}/project.json`,
    JSON.stringify(
      {
        name,
        $schema: `${d}node_modules/nx/schemas/project-schema.json`,
        sourceRoot,
        projectType: 'application',
        tags,
        targets: {
          serve: {
            executor: 'nx:run-commands',
            cache: false,
            options: { cwd: dir, command: commands.serve },
          },
          build: {
            executor: 'nx:run-commands',
            cache: true,
            options: { cwd: dir, command: commands.build },
            outputs: [`{workspaceRoot}/dist/${dir}`],
          },
          typecheck: {
            executor: 'nx:run-commands',
            cache: true,
            options: { cwd: dir, command: commands.typecheck },
          },
          test: {
            executor: 'nx:run-commands',
            cache: true,
            options: { cwd: dir, command: 'node --test scaffold.test.mjs' },
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
  tree.write(
    `${dir}/scaffold.test.mjs`,
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generated application metadata is coherent", async () => {
  const project = JSON.parse(await readFile(new URL("./project.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  assert.equal(project.name, "${name}");
  assert.equal(manifest.name, "@app/${name}");
});
`,
  );
}

function createAstroFrontendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  port: number,
): void {
  const d = dots(dir);
  writeRunCommandProject(tree, dir, names.kebab, `${dir}/src`, tags, {
    serve: `node_modules/.bin/astro dev --host localhost --port ${port}`,
    build: 'node_modules/.bin/astro build',
    typecheck: 'node_modules/.bin/astro check',
  });
  tree.write(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: `@app/${names.kebab}`,
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          react: runtimePackage(tree, 'react', '19.2.3', 'dependencies'),
          'react-dom': runtimePackage(tree, 'react-dom', '19.2.3', 'dependencies'),
        },
        devDependencies: {
          '@astrojs/check': runtimePackage(tree, '@astrojs/check', '0.9.9'),
          astro: runtimePackage(tree, 'astro', '7.0.9'),
          '@astrojs/react': runtimePackage(tree, '@astrojs/react', '6.0.1'),
          '@astrojs/node': runtimePackage(tree, '@astrojs/node', '11.0.2'),
          typescript: runtimePackage(tree, 'typescript', '6.0.3'),
        },
      },
      null,
      2,
    ) + '\n',
  );
  tree.write(
    `${dir}/astro.config.mjs`,
    `import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  root: import.meta.dirname,
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  outDir: "${d}dist/${dir}",
  output: "server",
  server: { host: "localhost", port: ${port} },
});
`,
  );
  tree.write(`${dir}/tsconfig.json`, `${JSON.stringify({ extends: 'astro/tsconfigs/strict' }, null, 2)}\n`);
  tree.write(
    `${dir}/src/pages/index.astro`,
    `---
const title = "${names.title}";
---

<html lang="${defaultLocale}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>{title}</title></head>
  <body><main><h1>{title}</h1><p>Astro application scaffold is ready.</p></main></body>
</html>
`,
  );
  tree.write(`${dir}/src/env.d.ts`, '/// <reference types="astro/client" />\n');
  writeFrontendPolicy(tree, names, dir);
}

function createVikeFrontendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  port: number,
): void {
  const d = dots(dir);
  const configFile = `${names.kebab}.vite.config.mts`;
  writeRunCommandProject(tree, dir, names.kebab, `${dir}/pages`, tags, {
    serve: `VITE_CONFIG="{configFile:'./${configFile}'}" node_modules/.bin/vike dev --host localhost --port ${port}`,
    build: `VITE_CONFIG="{configFile:'./${configFile}'}" node_modules/.bin/vike build`,
    typecheck: 'node_modules/.bin/tsc --noEmit --project tsconfig.json',
  });
  tree.write(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: `@app/${names.kebab}`,
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          react: runtimePackage(tree, 'react', '19.2.3', 'dependencies'),
          'react-dom': runtimePackage(tree, 'react-dom', '19.2.3', 'dependencies'),
          vike: runtimePackage(tree, 'vike', '0.4.260', 'dependencies'),
          'vike-react': runtimePackage(tree, 'vike-react', '0.6.25', 'dependencies'),
        },
        devDependencies: {
          '@vitejs/plugin-react': runtimePackage(tree, '@vitejs/plugin-react', '6.0.3'),
          typescript: runtimePackage(tree, 'typescript', '6.0.3'),
          vite: runtimePackage(tree, 'vite', '8.1.4'),
        },
      },
      null,
      2,
    ) + '\n',
  );
  tree.write(
    `${dir}/${configFile}`,
    `import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "${d}node_modules/.cache/vite/${dir}",
  resolve: { tsconfigPaths: true },
  server: { host: "localhost", port: ${port} },
  preview: { host: "localhost", port: ${port} },
  plugins: [react(), vike()],
  build: { outDir: "${d}dist/${dir}", emptyOutDir: true },
});
`,
  );
  const tsconfig = {
    extends: `${d}tsconfig.base.json`,
    compilerOptions: {
      jsx: 'react-jsx',
      module: 'esnext',
      moduleResolution: 'bundler',
      types: ['vite/client'],
    },
    include: ['pages/**/*.ts', 'pages/**/*.tsx', configFile],
  };
  tree.write(`${dir}/tsconfig.json`, `${JSON.stringify(tsconfig, null, 2)}\n`);
  tree.write(
    `${dir}/pages/+config.ts`,
    'import vikeReact from "vike-react/config";\n\nexport default { extends: vikeReact };\n',
  );
  tree.write(
    `${dir}/pages/index/+Page.tsx`,
    `export default function Page() {
  return <main><h1>${names.title}</h1><p>Vike SSR application scaffold is ready.</p></main>;
}
`,
  );
  writeFrontendPolicy(tree, names, dir);
}

function createExpoFrontendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  port: number,
): void {
  const d = dots(dir);
  writeRunCommandProject(tree, dir, names.kebab, `${dir}/app`, tags, {
    serve: `EXPO_NO_TELEMETRY=1 node_modules/.bin/expo start --port ${port}`,
    build: `EXPO_NO_TELEMETRY=1 node_modules/.bin/expo export --platform web --output-dir ${d}dist/${dir}`,
    typecheck: 'node_modules/.bin/tsc --noEmit --project tsconfig.json',
  });
  tree.write(
    `${dir}/package.json`,
    JSON.stringify(
      {
        name: `@app/${names.kebab}`,
        version: '0.0.0',
        private: true,
        main: 'expo-router/entry',
        dependencies: {
          expo: runtimePackage(tree, 'expo', '57.0.7', 'dependencies'),
          '@expo/metro-runtime': runtimePackage(tree, '@expo/metro-runtime', '57.0.6', 'dependencies'),
          'expo-router': runtimePackage(tree, 'expo-router', '57.0.7', 'dependencies'),
          react: runtimePackage(tree, 'react', '19.2.3', 'dependencies'),
          'react-dom': runtimePackage(tree, 'react-dom', '19.2.3', 'dependencies'),
          'react-native': runtimePackage(tree, 'react-native', '0.86.0', 'dependencies'),
          'react-native-safe-area-context': runtimePackage(
            tree,
            'react-native-safe-area-context',
            '5.7.0',
            'dependencies',
          ),
          'react-native-screens': runtimePackage(tree, 'react-native-screens', '4.25.2', 'dependencies'),
          'react-native-web': runtimePackage(tree, 'react-native-web', '0.21.2', 'dependencies'),
        },
        devDependencies: {
          '@babel/core': runtimePackage(tree, '@babel/core', '7.29.7'),
          '@types/react': runtimePackage(tree, '@types/react', '19.2.17'),
          'babel-preset-expo': runtimePackage(tree, 'babel-preset-expo', '57.0.3'),
          typescript: runtimePackage(tree, 'typescript', '6.0.3'),
        },
      },
      null,
      2,
    ) + '\n',
  );
  tree.write(
    `${dir}/app.json`,
    `${JSON.stringify({ expo: { name: names.title, slug: names.kebab, scheme: names.kebab, plugins: ['expo-router'], web: { bundler: 'metro' } } }, null, 2)}\n`,
  );
  tree.write(
    `${dir}/metro.config.js`,
    `const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { configureWorkspaceMetro } = require("${d}config/metro/workspace-tsconfig-aliases.cjs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "${d}");
const config = getDefaultConfig(projectRoot);

module.exports = configureWorkspaceMetro(config, { projectRoot, workspaceRoot });
`,
  );
  tree.write(
    `${dir}/babel.config.js`,
    `module.exports = function configureExpoBabel(api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
`,
  );
  tree.write(
    `${dir}/tsconfig.json`,
    `${JSON.stringify({ extends: 'expo/tsconfig.base', compilerOptions: { strict: true }, include: ['app/**/*.ts', 'app/**/*.tsx', 'expo-env.d.ts'] }, null, 2)}\n`,
  );
  tree.write(`${dir}/expo-env.d.ts`, '/// <reference types="expo/types" />\n');
  tree.write(
    `${dir}/app/_layout.tsx`,
    'import { Stack } from "expo-router";\n\nexport default function Layout() { return <Stack />; }\n',
  );
  tree.write(
    `${dir}/app/index.tsx`,
    `import { Text, View } from "react-native";

export default function HomeScreen() {
  return <View accessibilityRole="summary"><Text accessibilityRole="header">${names.title}</Text></View>;
}
`,
  );
  writeFrontendPolicy(tree, names, dir);
}

function createFrontendApp(
  tree: Tree,
  names: ReturnType<typeof generateNames>,
  dir: string,
  tags: string[],
  renderer: 'vite' | 'astro' | 'vike' | 'expo',
  port: number,
): void {
  switch (renderer) {
    case 'vite':
      createViteFrontendApp(tree, names, dir, tags, port);
      writeFrontendPolicy(tree, names, dir);
      break;
    case 'astro':
      createAstroFrontendApp(tree, names, dir, tags, port);
      break;
    case 'vike':
      createVikeFrontendApp(tree, names, dir, tags, port);
      break;
    case 'expo':
      createExpoFrontendApp(tree, names, dir, tags, port);
      break;
  }
}

// ---------------------------------------------------------------------------

export async function applicationGenerator(tree: Tree, options: ApplicationGeneratorOptions): Promise<void> {
  const nameError = validateName(options.name);
  if (nameError) {
    throw new Error(nameError);
  }

  if (options.kind !== 'frontend' && options.kind !== 'backend' && options.kind !== 'e2e') {
    throw new Error(`Unsupported application kind "${options.kind}". Must be "frontend", "backend", or "e2e".`);
  }

  const renderer =
    options.renderer ?? (options.kind === 'frontend' ? 'vite' : options.kind === 'backend' ? 'nest-api' : 'cucumber');
  const frontendRenderers = ['vite', 'astro', 'vike', 'expo'];
  const backendRenderers = ['nest-api', 'consumer', 'scheduler'];
  const e2eRenderers = ['cucumber'];
  const allowedRenderers =
    options.kind === 'frontend' ? frontendRenderers : options.kind === 'backend' ? backendRenderers : e2eRenderers;
  if (!allowedRenderers.includes(renderer)) {
    throw new Error(
      `Unsupported ${options.kind} renderer "${renderer}". Must be one of: ${allowedRenderers.join(', ')}`,
    );
  }

  const usedPorts = collectUsedAppPorts(tree);
  const isBackendProcess = renderer === 'consumer' || renderer === 'scheduler';
  const isNonHttp = isBackendProcess || options.kind === 'e2e';
  if (isNonHttp && options.port !== undefined) {
    throw new Error(
      options.kind === 'e2e'
        ? 'E2E applications do not expose an HTTP port; omit --port.'
        : 'Consumer and scheduler applications do not expose an HTTP port; omit --port.',
    );
  }
  const port =
    options.port ?? (isNonHttp ? 3100 : nextAvailablePort(options.kind as 'frontend' | 'backend', usedPorts));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Application port must be an integer between 1 and 65535.');
  }
  if (!isNonHttp && options.port !== undefined && usedPorts.has(port)) {
    throw new Error(`Application port ${port} is already used by another app. Choose a free port or omit --port.`);
  }

  const names = generateNames(options.name);
  const projectName = names.kebab;

  const reservedOwners = new Set(['app', 'default-app', 'example-app', 'sample-app', 'starter-app', 'template-app']);
  if (reservedOwners.has(cloneStyleBaseName(projectName))) {
    throw new Error(`"${projectName}" is not a product owner. Choose the real application name and ownership.`);
  }
  if (options.directory) {
    throw new Error(
      'Custom application directories are disabled; use the canonical apps/frontend or apps/backend root.',
    );
  }
  if (options.tags) {
    throw new Error('Custom application tags are disabled; ownership tags are derived from application kind and name.');
  }

  const existing = findExistingProject(tree, projectName);
  if (existing) {
    throw new Error(`Application "${existing}" already exists. Choose a different name.`);
  }

  const projects = getProjects(tree);
  const adjacentOwner = findAdjacentOwner(
    projectName,
    [...projects.entries()]
      .filter(([, config]) => config.projectType === 'application')
      .map(([name, config]) => ({ name, root: config.root })),
  );
  if (adjacentOwner) {
    throw new Error(
      `Refusing adjacent application "${projectName}" beside existing owner "${adjacentOwner}". Modify the existing owner in place.`,
    );
  }

  const dir = computeAppDirectory(options.kind, names.kebab);
  const tags = computeAppTags(options.kind, names.kebab);

  if (options.kind === 'backend') {
    createBackendApp(tree, names, dir, tags, renderer as 'nest-api' | 'consumer' | 'scheduler', port);
  } else if (options.kind === 'e2e') {
    createCucumberApp(tree, names, dir, tags);
  } else {
    createFrontendApp(tree, names, dir, tags, renderer as 'vite' | 'astro' | 'vike' | 'expo', port);
  }

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

export default applicationGenerator;
