import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import type { SelectedClosureManifest } from '../setup/closure.js';
import { defaultOperationalFields } from '../setup/test-fixtures.js';
import {
  deploymentInstallPlan,
  isolatedRuntimeEnvironment,
  linkSelectedSourceDependencies,
  selectedProjectClosure,
  selectedProjectOutputPaths,
  stageDeploymentArtifact,
  stageSelectedMigratorManifest,
  validateSelectedBuildProjects,
  validateSelectedMigrator,
} from './deployment-artifact.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function closure(provider: 'postgres' | 'mongodb' | null = 'postgres'): SelectedClosureManifest {
  return {
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64),
    provider,
    roots: ['auth-app-api'],
    projects: [
      '@app/backend-common-bootstrap',
      ...(provider === 'postgres' ? ['@app/backend-postgres-main'] : []),
      ...(provider === 'mongodb' ? ['@app/backend-mongodb-main'] : []),
      'auth-app-api',
    ].sort((left, right) => left.localeCompare(right)),
    targets: { build: ['auth-app-api'] },
    externalPackages: {
      jiti: '1.0.0',
      ...(provider === 'postgres' ? { pg: '1.0.0' } : {}),
      ...(provider === 'mongodb' ? { mongodb: '1.0.0' } : {}),
    },
    services: ['auth-app-api'],
    releaseImages: ['auth-app-api', ...(provider ? ['migrator'] : [])].sort((left, right) => left.localeCompare(right)),
    ...defaultOperationalFields(),
  };
}

function graph(provider: 'postgres' | 'mongodb' = 'postgres') {
  const databaseProject = `@app/backend-${provider}-main`;
  return {
    nodes: {
      'auth-app-api': {
        data: {
          root: 'apps/backend/auth/auth-app-api',
          targets: {
            build: { options: { outputPath: 'dist/apps/backend/auth/auth-app-api' } },
          },
        },
      },
      '@app/backend-common-bootstrap': {
        data: { targets: { build: { options: { outputPath: 'dist/libs/backend/common/bootstrap/lib' } } } },
      },
      [databaseProject]: {
        data: { targets: { build: { options: { outputPath: `dist/libs/backend/${provider}/main/shared/lib` } } } },
      },
    },
    dependencies: {
      'auth-app-api': [{ target: '@app/backend-common-bootstrap' }, { target: databaseProject }],
      '@app/backend-common-bootstrap': [],
      [databaseProject]: [],
    },
  };
}

function siteClosure(): SelectedClosureManifest {
  return {
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64),
    provider: null,
    roots: ['site-app'],
    projects: ['site-app'],
    targets: { build: ['site-app'] },
    externalPackages: {
      '@fastify/static': '1.0.0',
      fastify: '1.0.0',
    },
    services: ['site-app'],
    releaseImages: ['site-app'],
    ...defaultOperationalFields(),
  };
}

function siteGraph() {
  return {
    nodes: {
      'site-app': {
        data: {
          root: 'apps/frontend/site',
          targets: {
            build: { outputs: ['{workspaceRoot}/dist/apps/frontend/site'] },
          },
        },
      },
    },
    dependencies: { 'site-app': [] },
  };
}

function writeBackendOutputs(root: string, provider: 'postgres' | 'mongodb' = 'postgres'): void {
  const app = join(root, 'dist/apps/backend/auth/auth-app-api');
  const main = join(app, 'apps/backend/auth/auth-app-api/src');
  mkdirSync(main, { recursive: true });
  mkdirSync(join(root, 'dist/libs/backend/common/bootstrap/lib'), { recursive: true });
  mkdirSync(join(root, `dist/libs/backend/${provider}/main/shared/lib`), { recursive: true });
  writeFileSync(join(main, 'main.js'), 'process.exitCode = 0;\n');
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({
      name: 'auth-app-api',
      main: 'apps/backend/auth/auth-app-api/src/main.js',
      dependencies: { [provider === 'postgres' ? 'pg' : 'mongodb']: '1.0.0' },
    }),
  );
  writeFileSync(join(app, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
}

void describe('deployment artifact closure', () => {
  void it('validates exact selected build roots and rejects closure escapes', () => {
    const selected = closure();
    assert.deepEqual(validateSelectedBuildProjects(selected, 'auth-app-api'), ['auth-app-api']);
    assert.throws(() => validateSelectedBuildProjects(selected, 'user-app-api'), /outside the selected closure/u);
    assert.throws(() => validateSelectedBuildProjects(selected, 'auth-app-api,auth-app-api'), /unique/u);
    assert.equal(validateSelectedMigrator(selected), 'postgres');
    assert.throws(() => validateSelectedMigrator(closure(null)), /requires a selected/u);
  });

  void it('stages only the selected transitive output and dependency closure', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-artifact-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-artifact-stage-'));
    roots.push(root, artifactRoot);
    writeBackendOutputs(root);
    mkdirSync(join(root, 'dist/apps/backend/user/user-app-api'), { recursive: true });
    writeFileSync(join(root, 'dist/apps/backend/user/user-app-api/leak.js'), 'leak\n');

    const artifact = stageDeploymentArtifact({
      workspaceRoot: root,
      artifactRoot,
      graph: graph(),
      closure: closure(),
      project: 'auth-app-api',
    });

    assert.equal(artifact.kind, 'backend');
    assert.match(artifact.entry, /auth-app-api.*main\.js/u);
    assert.ok(!artifact.outputPaths.some((path) => path.includes('user-app-api')));
    assert.deepEqual(deploymentInstallPlan(artifact), {
      command: 'pnpm',
      args: ['install', '--prod', '--prefer-offline', '--no-frozen-lockfile', '--ignore-scripts', '--ignore-workspace'],
      cwd: artifactRoot,
    });
  });

  void it('prunes generated transitive and opposite-provider dependencies to the selected closure', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-artifact-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-artifact-stage-'));
    roots.push(root, artifactRoot);
    writeBackendOutputs(root);
    const generatedManifest = join(root, 'dist/apps/backend/auth/auth-app-api/package.json');
    const manifest = JSON.parse(readFileSync(generatedManifest, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      generatedManifest,
      JSON.stringify({
        ...manifest,
        dependencies: {
          pg: '1.0.0',
          mongodb: '1.0.0',
          '@opentelemetry/api': '1.0.0',
        },
      }),
    );

    stageDeploymentArtifact({
      workspaceRoot: root,
      artifactRoot,
      graph: graph(),
      closure: closure(),
      project: 'auth-app-api',
    });

    const staged = JSON.parse(readFileSync(join(artifactRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    assert.deepEqual(staged.dependencies, { pg: '1.0.0' });
  });

  void it('links selected app roots to the flattened source dependency closure', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-source-links-'));
    roots.push(root);
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    mkdirSync(join(root, 'apps/backend/auth/auth-app-api'), { recursive: true });

    linkSelectedSourceDependencies(root, graph(), closure());

    assert.ok(lstatSync(join(root, 'apps/backend/auth/auth-app-api/node_modules')).isSymbolicLink());
  });

  void it('generates the site runtime package from its explicit dependency contract', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-site-artifact-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-site-artifact-stage-'));
    roots.push(root, artifactRoot);
    mkdirSync(join(root, 'apps/frontend/site'), { recursive: true });
    mkdirSync(join(root, '.nrb/closure'), { recursive: true });
    mkdirSync(join(root, 'dist/apps/frontend/site/server'), { recursive: true });
    writeFileSync(
      join(root, 'apps/frontend/site/runtime-dependencies.json'),
      JSON.stringify(['@fastify/static', 'fastify']),
    );
    writeFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), "packages:\n  - '.'\n");
    writeFileSync(join(root, 'dist/apps/frontend/site/server/index.js'), 'process.exitCode = 0;\n');

    const artifact = stageDeploymentArtifact({
      workspaceRoot: root,
      artifactRoot,
      graph: siteGraph(),
      closure: siteClosure(),
      project: 'site-app',
    });

    const manifest = JSON.parse(readFileSync(join(artifactRoot, 'package.json'), 'utf8')) as {
      name: string;
      type: string;
      dependencies: Record<string, string>;
    };
    assert.equal(artifact.kind, 'site');
    assert.equal(manifest.name, 'site-app');
    assert.equal(manifest.type, 'module');
    assert.deepEqual(manifest.dependencies, { '@fastify/static': '1.0.0', fastify: '1.0.0' });
  });

  void it('rejects missing generated backend manifests and locks', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-artifact-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-artifact-stage-'));
    roots.push(root, artifactRoot);
    writeBackendOutputs(root);
    rmSync(join(root, 'dist/apps/backend/auth/auth-app-api/package.json'));
    assert.throws(
      () =>
        stageDeploymentArtifact({
          workspaceRoot: root,
          artifactRoot,
          graph: graph(),
          closure: closure(),
          project: 'auth-app-api',
        }),
      /package manifest is missing/u,
    );

    writeBackendOutputs(root);
    rmSync(join(root, 'dist/apps/backend/auth/auth-app-api/pnpm-lock.yaml'));
    assert.throws(
      () =>
        stageDeploymentArtifact({
          workspaceRoot: root,
          artifactRoot,
          graph: graph(),
          closure: closure(),
          project: 'auth-app-api',
        }),
      /pnpm lock is missing/u,
    );
  });

  void it('rejects path escapes, output symlink escapes, and opposite providers', () => {
    const selected = closure();
    const escaped = graph();
    escaped.nodes['auth-app-api']!.data.targets!.build!.options!.outputPath = '../outside';
    assert.throws(() => selectedProjectOutputPaths(escaped, selected, 'auth-app-api'), /escapes its allowed root/u);

    const oppositeGraph = graph('mongodb');
    assert.throws(
      () => selectedProjectClosure(oppositeGraph, selected, 'auth-app-api'),
      /outside the selected closure|opposite-provider/u,
    );

    const root = mkdtempSync(join(tmpdir(), 'nrb-artifact-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-artifact-stage-'));
    const outside = mkdtempSync(join(tmpdir(), 'nrb-artifact-outside-'));
    roots.push(root, artifactRoot, outside);
    writeBackendOutputs(root);
    assert.throws(
      () =>
        stageDeploymentArtifact({
          workspaceRoot: root,
          artifactRoot: join(root, 'artifact'),
          graph: graph(),
          closure: selected,
          project: 'auth-app-api',
        }),
      /outside the source workspace/u,
    );
    symlinkSync(outside, join(root, 'dist/apps/backend/auth/auth-app-api/escape'));
    assert.throws(
      () =>
        stageDeploymentArtifact({
          workspaceRoot: root,
          artifactRoot,
          graph: graph(),
          closure: selected,
          project: 'auth-app-api',
        }),
      /symlink escapes/u,
    );
  });

  void it('stages a provider-isolated migrator dependency manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-migrator-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-migrator-stage-'));
    roots.push(root, artifactRoot);
    mkdirSync(join(root, 'docker'), { recursive: true });
    mkdirSync(join(root, '.nrb/closure'), { recursive: true });
    writeFileSync(
      join(root, 'docker/migrator-package.json'),
      JSON.stringify({ dependencies: { pg: '1.0.0', mongodb: '1.0.0', jiti: '1.0.0' } }),
    );
    writeFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), "packages:\n  - '.'\n");

    stageSelectedMigratorManifest(root, artifactRoot, closure('postgres'));
    const manifest = JSON.parse(readFileSync(join(artifactRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    assert.deepEqual(manifest.dependencies, { pg: '1.0.0', jiti: '1.0.0' });
  });

  void it('removes NODE_PATH for both Node and Bun artifact processes', () => {
    const base = { NODE_PATH: '/workspace/libs/backend/node_modules', PATH: '/usr/bin', BUN_RUNTIME: '1' };
    const nodeEnvironment = isolatedRuntimeEnvironment(base);
    const bunEnvironment = isolatedRuntimeEnvironment(base);
    assert.equal(nodeEnvironment.NODE_PATH, undefined);
    assert.equal(bunEnvironment.NODE_PATH, undefined);
    assert.equal(nodeEnvironment.PATH, '/usr/bin');
    assert.equal(bunEnvironment.BUN_RUNTIME, '1');
  });
});
