import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import type { Tree } from '@nx/devkit';
import { libraryGenerator } from '../library/generator.js';
import { applicationGenerator } from './generator.js';

const workspaceRoot = process.cwd();
const frontendNames = ['nrb-canary-vite', 'nrb-canary-astro', 'nrb-canary-vike', 'nrb-canary-expo'] as const;
const backendNames = ['nrb-canary-api', 'nrb-canary-consumer', 'nrb-canary-scheduler'] as const;
const libraryProjects = [
  '@app/backend-nrb-canary-backend-lib',
  '@app/frontend-nrb-canary-frontend-lib',
  '@app/common-nrb-canary-common-lib',
] as const;
const projectNames = [...frontendNames, ...backendNames, ...libraryProjects];
const generatedRoots = [
  ...frontendNames.map((name) => `apps/frontend/${name}`),
  ...backendNames.map((name) => `apps/backend/nrb/${name}`),
  'libs/backend/common/nrb-canary-backend-lib',
  'libs/frontend/nrb-canary-frontend-lib',
  'libs/common/nrb-canary-common-lib',
];
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

function resetNxWorkspaceData(): void {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  execFileSync(join(workspaceRoot, 'node_modules/.bin/nx'), ['reset', '--onlyWorkspaceData'], {
    cwd: workspaceRoot,
    env: environment,
    stdio: 'inherit',
  });
}

function runNxTargets(targets: string, projects: readonly string[]): void {
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NX_DAEMON: 'false',
    NX_ISOLATE_PLUGINS: 'false',
  };
  delete childEnvironment.NODE_TEST_CONTEXT;

  execFileSync(
    join(workspaceRoot, 'node_modules/.bin/nx'),
    [
      'run-many',
      `--targets=${targets}`,
      `--projects=${projects.join(',')}`,
      '--parallel=1',
      '--skip-nx-cache',
      '--output-style=static',
      '--verbose',
    ],
    {
      cwd: workspaceRoot,
      env: childEnvironment,
      stdio: 'inherit',
      timeout: 300_000,
    },
  );
}

void test(
  'every application renderer and library runtime generates runnable contracts',
  { timeout: 600_000 },
  async () => {
    assert.ok(
      existsSync(join(workspaceRoot, 'nx.json')) && existsSync(join(workspaceRoot, 'package.json')),
      'Run scaffold verification from the repository root.',
    );

    cleanupGeneratedFiles();
    resetNxWorkspaceData();
    for (const root of generatedRoots) {
      assert.equal(existsSync(join(workspaceRoot, root)), false, `Canary path already exists: ${root}`);
    }

    const { createTreeWithEmptyWorkspace } = await import('nx/src/devkit-testing-exports');
    const tree = createTreeWithEmptyWorkspace();
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

    const astroProject = readTreeJson(tree, 'apps/frontend/nrb-canary-astro/project.json');
    const astroTargets = recordProperty(astroProject, 'targets');
    const astroTypecheck = recordProperty(astroTargets, 'typecheck');
    const astroTypecheckOptions = recordProperty(astroTypecheck, 'options');
    const astroTypecheckCommand = astroTypecheckOptions.command;

    const astroPackage = readTreeJson(tree, 'apps/frontend/nrb-canary-astro/package.json');
    const astroDevDependencies = recordProperty(astroPackage, 'devDependencies');
    assert.equal(astroProject.name, 'nrb-canary-astro');
    assert.equal(astroPackage.name, undefined);
    assert.equal(astroDevDependencies.astro, '7.1.3');
    assert.ok(typeof astroTypecheckCommand === 'string');
    assert.match(astroTypecheckCommand, /astro check/);

    try {
      flushGeneratedFiles(tree);
      runNxTargets('build,test', projectNames);
      runNxTargets('typecheck', projectNames);
    } finally {
      cleanupGeneratedFiles();
      resetNxWorkspaceData();
    }
  },
);
