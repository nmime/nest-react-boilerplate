// @requirements REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import type { Tree } from '@nx/devkit';
import { featureGenerator } from '../feature/generator.js';
import { libraryGenerator } from '../library/generator.js';
import { applicationGenerator } from './generator.js';
import {
  acquireScaffoldVerificationLock,
  assertScaffoldRootsAvailable,
  scaffoldTargetTimeoutMs,
  type ScaffoldResourceClass,
  type ScaffoldVerificationTarget,
} from './scaffold-verification.js';

const workspaceRoot = process.cwd();
const frontendNames = ['nrb-canary-vite', 'nrb-canary-astro', 'nrb-canary-vike', 'nrb-canary-expo'] as const;
const backendNames = ['nrb-canary-api', 'nrb-canary-consumer', 'nrb-canary-scheduler'] as const;
const e2eNames = ['nrb-canary-acceptance-e2e'] as const;
const libraryProjects = [
  '@app/backend-nrb-canary-backend-lib',
  '@app/frontend-nrb-canary-frontend-lib',
  '@app/common-nrb-canary-common-lib',
] as const;
const projectNames = [...frontendNames, ...backendNames, ...e2eNames, ...libraryProjects];
const generatedRoots = [
  ...frontendNames.map((name) => `apps/frontend/${name}`),
  ...backendNames.map((name) => `apps/backend/nrb/${name}`),
  'apps/e2e/nrb-canary-acceptance',
  'libs/backend/common/nrb-canary-backend-lib',
  'libs/frontend/nrb-canary-frontend-lib',
  'libs/common/nrb-canary-common-lib',
];
let nxWorkspaceDataDirectory: string | undefined;
function isGeneratedPath(path: string): boolean {
  return generatedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTreeJson(tree: Tree, path: string): Record<string, unknown> {
  const content = tree.read(path, 'utf8');
  assert.ok(content, `Generated JSON file is missing or empty: ${path}`);

  const value: unknown = JSON.parse(content);
  assert.ok(isRecord(value), `Generated JSON file must contain an object: ${path}`);
  return value;
}

function recordProperty(record: Record<string, unknown>, property: string): Record<string, unknown> {
  const value = record[property];
  assert.ok(isRecord(value), `Expected generated JSON object property: ${property}`);
  return value;
}

function flushGeneratedFiles(tree: Tree): void {
  for (const change of tree.listChanges()) {
    if (!isGeneratedPath(change.path)) {
      continue;
    }

    const destination = resolve(workspaceRoot, change.path);
    assert.ok(
      destination.startsWith(`${resolve(workspaceRoot)}${sep}`),
      `Refusing to write generated path outside the workspace: ${change.path}`,
    );

    if (change.type === 'DELETE') {
      rmSync(destination, { force: true, recursive: true });
      continue;
    }

    assert.ok(change.content, `Generated change has no content: ${change.path}`);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, change.content);
  }
}

function cleanupGeneratedFiles(): void {
  for (const root of generatedRoots) {
    rmSync(join(workspaceRoot, root), { force: true, recursive: true });
    rmSync(join(workspaceRoot, 'dist', root), { force: true, recursive: true });
    rmSync(join(workspaceRoot, 'dist/out-tsc', root), { force: true, recursive: true });
    rmSync(join(workspaceRoot, 'coverage', root), { force: true, recursive: true });
    rmSync(join(workspaceRoot, 'coverage/e2e', root), { force: true, recursive: true });
  }

  try {
    rmdirSync(join(workspaceRoot, 'apps/backend/nrb'));
  } catch {
    // Preserve the parent when another project already owns the scope.
  }
}

async function verifyProductionMigrationRegistrationCanary(): Promise<void> {
  const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
  const tree = createTreeWithEmptyWorkspace();
  for (const path of [
    'apps/backend/user/user-app-api/project.json',
    'apps/backend/user/user-app-api/src/main.ts',
    'apps/backend/user/user-app-api/src/user-app-api.module.ts',
    'apps/frontend/app/project.json',
    'apps/frontend/app/vite.config.mts',
    'packages/tooling/src/commands/db/generated-mongo-migrations.ts',
    'packages/tooling/src/commands/db/orm-migration-config.ts',
    'tsconfig.base.json',
  ]) {
    tree.write(path, readFileSync(join(workspaceRoot, path)));
  }

  await featureGenerator(tree, {
    name: 'nrb-migration-canary',
    apiApp: 'user-app-api',
    frontendApp: 'user-app',
    migrationTimestamp: '20990101000000',
    skipFormat: true,
  });
  await featureGenerator(tree, {
    name: 'nrb-mongo-migration-canary',
    apiApp: 'user-app-api',
    frontendApp: 'user-app',
    database: 'mongodb',
    migrationTimestamp: '20990101000002',
    skipFormat: true,
  });
  await featureGenerator(tree, {
    name: 'nrb-second-migration-canary',
    apiApp: 'user-app-api',
    frontendApp: 'user-app',
    migrationTimestamp: '20990101000001',
    skipFormat: true,
  });

  const runner = tree.read('packages/tooling/src/commands/db/orm-migration-config.ts', 'utf8') ?? '';
  assert.match(
    runner,
    /const \{ nrbMigrationCanaryMigrations \} = require\("@app\/backend-postgres-main-nrb-migration-canary"\);/u,
  );
  assert.match(runner, /\.\.\.nrbMigrationCanaryMigrations, \.\.\.nrbSecondMigrationCanaryMigrations/u);
  assert.match(
    tree.read(
      'libs/backend/postgres/main/nrb-second-migration-canary/lib/src/infrastructure/data-access/migrations/index.ts',
      'utf8',
    ) ?? '',
    /export const nrbSecondMigrationCanaryMigrations = \[Migration20990101000001CreateNrbSecondMigrationCanary\] as const;/u,
  );
  const mongoRegistry = tree.read('packages/tooling/src/commands/db/generated-mongo-migrations.ts', 'utf8') ?? '';
  assert.match(mongoRegistry, /import \{ nrbMongoMigrationCanaryMongoMigrations \}/u);
  assert.match(mongoRegistry, /\.\.\.nrbMongoMigrationCanaryMongoMigrations/u);
  assert.doesNotMatch(runner, /nrbMongoMigrationCanary/u);
}

function runNxTarget(target: ScaffoldVerificationTarget, project: string, resource: ScaffoldResourceClass): void {
  nxWorkspaceDataDirectory ??= mkdtempSync(join(tmpdir(), 'nrb-scaffold-nx-'));
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NX_DAEMON: 'false',
    NX_ISOLATE_PLUGINS: 'false',
    NX_WORKSPACE_DATA_DIRECTORY: nxWorkspaceDataDirectory,
  };
  delete childEnvironment.NODE_TEST_CONTEXT;

  execFileSync(
    join(workspaceRoot, 'node_modules/.bin/nx'),
    [
      'run',
      `${project}:${target}`,
      '--excludeTaskDependencies',
      '--parallel=1',
      '--skip-nx-cache',
      '--output-style=static',
      '--verbose',
    ],
    {
      cwd: workspaceRoot,
      env: childEnvironment,
      stdio: 'inherit',
      timeout: scaffoldTargetTimeoutMs(resource, target),
    },
  );
}

const verificationScopes: ReadonlyArray<{ project: string; resource: ScaffoldResourceClass }> = [
  ...backendNames.map((project) => ({ project, resource: 'node' as const })),
  ...libraryProjects.map((project) => ({ project, resource: 'node' as const })),
  { project: 'nrb-canary-vite', resource: 'browser' },
  { project: 'nrb-canary-astro', resource: 'ssr' },
  { project: 'nrb-canary-vike', resource: 'ssr' },
  { project: 'nrb-canary-expo', resource: 'native' },
  { project: 'nrb-canary-acceptance-e2e', resource: 'node' },
];
const verificationTargets = ['build', 'test', 'typecheck'] as const;
const totalVerificationTimeoutMs =
  verificationScopes.reduce(
    (total, { resource }) =>
      total +
      verificationTargets.reduce((scopeTotal, target) => scopeTotal + scaffoldTargetTimeoutMs(resource, target), 0),
    0,
  ) + 60_000;

void test(
  'every application renderer and library runtime generates runnable contracts',
  { timeout: totalVerificationTimeoutMs },
  async () => {
    const releaseLock = acquireScaffoldVerificationLock(workspaceRoot);
    let ownsGeneratedFiles = false;
    try {
      assert.ok(
        existsSync(join(workspaceRoot, 'nx.json')) && existsSync(join(workspaceRoot, 'package.json')),
        'Run scaffold verification from the repository root.',
      );
      assertScaffoldRootsAvailable(workspaceRoot, generatedRoots);
      await verifyProductionMigrationRegistrationCanary();

      const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
      const tree = createTreeWithEmptyWorkspace();
      tree.write('package.json', readFileSync(join(workspaceRoot, 'package.json')));

      await applicationGenerator(tree, {
        name: 'nrb-canary-vite',
        kind: 'frontend',
        renderer: 'vite',
        port: 4610,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-astro',
        kind: 'frontend',
        renderer: 'astro',
        port: 4611,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-vike',
        kind: 'frontend',
        renderer: 'vike',
        port: 4612,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-expo',
        kind: 'frontend',
        renderer: 'expo',
        port: 4613,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-api',
        kind: 'backend',
        renderer: 'nest-api',
        port: 3610,
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-consumer',
        kind: 'backend',
        renderer: 'consumer',
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-scheduler',
        kind: 'backend',
        renderer: 'scheduler',
        skipFormat: true,
      });
      await applicationGenerator(tree, {
        name: 'nrb-canary-acceptance-e2e',
        kind: 'e2e',
        renderer: 'cucumber',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'nrb-canary-backend-lib',
        kind: 'backend',
        type: 'util',
        scope: 'nrb',
        description: 'Provides backend canary helpers used to verify generated Node library contracts.',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'nrb-canary-frontend-lib',
        kind: 'frontend',
        type: 'ui',
        scope: 'nrb',
        description: 'Provides a frontend canary component used to verify generated React library contracts.',
        skipFormat: true,
      });
      await libraryGenerator(tree, {
        name: 'nrb-canary-common-lib',
        kind: 'common',
        type: 'util',
        scope: 'nrb',
        description: 'Provides shared canary utilities used to verify cross-runtime library contracts.',
        skipFormat: true,
      });

      const astroPackage = readTreeJson(tree, 'apps/frontend/nrb-canary-astro/package.json');
      const astroDevDependencies = recordProperty(astroPackage, 'devDependencies');
      const astroProject = readTreeJson(tree, 'apps/frontend/nrb-canary-astro/project.json');
      const astroTargets = recordProperty(astroProject, 'targets');
      const astroTypecheck = recordProperty(astroTargets, 'typecheck');
      const astroTypecheckOptions = recordProperty(astroTypecheck, 'options');
      const astroTypecheckCommand = astroTypecheckOptions.command;

      assert.equal(astroProject.name, 'nrb-canary-astro');
      assert.equal(astroPackage.name, undefined);
      assert.equal(astroDevDependencies.astro, '7.1.3');
      assert.equal(astroDevDependencies['@astrojs/check'], '0.9.9');
      assert.ok(typeof astroTypecheckCommand === 'string');
      assert.match(astroTypecheckCommand, /astro check/);

      ownsGeneratedFiles = true;
      flushGeneratedFiles(tree);
      assert.deepEqual(
        verificationScopes.map(({ project }) => project).sort((left, right) => left.localeCompare(right)),
        [...projectNames].sort((left, right) => left.localeCompare(right)),
        'Every generated canary must have one resource-scoped verification budget.',
      );
      for (const { project, resource } of verificationScopes) {
        for (const target of verificationTargets) {
          runNxTarget(target, project, resource);
        }
      }
    } finally {
      if (ownsGeneratedFiles) {
        cleanupGeneratedFiles();
      }
      if (nxWorkspaceDataDirectory) {
        rmSync(nxWorkspaceDataDirectory, { force: true, recursive: true });
        nxWorkspaceDataDirectory = undefined;
      }
      releaseLock();
    }
  },
);
