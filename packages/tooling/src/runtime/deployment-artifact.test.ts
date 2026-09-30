// @requirements REQ-SCAFFOLD-SELECTION-002 REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { parseAllDocuments } from 'yaml';

import type { SelectedClosureManifest } from '../setup/closure.js';
import { defaultOperationalFields } from '../setup/test-fixtures.js';
import {
  deploymentInstallPlan,
  isolatedRuntimeEnvironment,
  linkSelectedSourceDependencies,
  matchesConfiguredClosure,
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
    projects: ['@app/common-i18n-keys', 'site-app'],
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
      '@app/common-i18n-keys': {
        data: {
          root: 'libs/common/i18n/keys/lib',
          targets: {
            build: { options: { outputPath: 'dist/libs/common/i18n-keys' } },
          },
        },
      },
    },
    dependencies: {
      'site-app': [{ target: '@app/common-i18n-keys' }],
      '@app/common-i18n-keys': [],
    },
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
      packageManager: 'pnpm@12.8.1',
      main: 'apps/backend/auth/auth-app-api/src/main.js',
      dependencies: { [provider === 'postgres' ? 'pg' : 'mongodb']: '1.0.0' },
    }),
  );
  writeFileSync(
    join(app, 'pnpm-lock.yaml'),
    JSON.stringify({
      lockfileVersion: '9.0',
      importers: {
        '.': {
          dependencies: { [provider === 'postgres' ? 'pg' : 'mongodb']: { specifier: '1.0.0', version: '1.0.0' } },
        },
      },
    }),
  );
  mkdirSync(join(root, '.nrb/closure'), { recursive: true });
  writeFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), "packages:\n  - '.'\n");
  writeFileSync(
    join(root, '.nrb/closure/pnpm-lock.yaml'),
    `${JSON.stringify({
      lockfileVersion: '9.0',
      importers: { '.': { packageManagerDependencies: { pnpm: { specifier: '12.8.1', version: '12.8.1' } } } },
    })}\n---\nlockfileVersion: '9.0'\n`,
  );
}

function writeSelectedRuntimeLock(root: string, dependencies: string[], devDependencies: string[] = []) {
  const locked = (names: string[]) =>
    Object.fromEntries(names.map((name) => [name, { specifier: '1.0.0', version: '1.0.0' }]));
  const environment = {
    lockfileVersion: '9.0',
    importers: { '.': { packageManagerDependencies: { pnpm: { specifier: '12.8.1', version: '12.8.1' } } } },
    packages: { 'pnpm@12.8.1': { resolution: { integrity: 'sha512-selected-package-manager-integrity' } } },
  };
  const application = {
    lockfileVersion: '9.0',
    settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
    overrides: { 'transitive-runtime': '1.0.0' },
    packageExtensionsChecksum: 'sha256-selected-package-extensions',
    importers: {
      '.': { dependencies: locked(dependencies), devDependencies: locked(devDependencies) },
      'unselected-app': { dependencies: locked(['unselected-package']) },
    },
    packages: { 'transitive-runtime@1.0.0': { resolution: { integrity: 'sha512-locked-transitive-runtime' } } },
    snapshots: { 'transitive-runtime@1.0.0': {} },
  };
  mkdirSync(join(root, '.nrb/closure'), { recursive: true });
  writeFileSync(join(root, '.nrb/closure/package.json'), JSON.stringify({ packageManager: 'pnpm@12.8.1' }));
  writeFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), "packages:\n  - '.'\nminimumReleaseAge: 1440\n");
  writeFileSync(
    join(root, '.nrb/closure/pnpm-lock.yaml'),
    `${JSON.stringify(environment)}\n---\n${JSON.stringify(application)}\n`,
  );
  return { environment, application };
}

void describe('deployment artifact closure', () => {
  void it('keeps product graph validation exact while accepting locked all-reference package classification', () => {
    const actual = closure('mongodb');
    const expected = {
      ...actual,
      graphDigest: 'c'.repeat(64),
      productExternalPackages: { jsdom: '29.1.1' },
      toolingExternalPackages: { 'react-native-web': '0.21.2' },
    };

    assert.equal(matchesConfiguredClosure(actual, expected, false), false);
    assert.equal(matchesConfiguredClosure(actual, expected, true), true);
    assert.equal(matchesConfiguredClosure(actual, { ...expected, roots: ['user-app-api'] }, true), false);
  });

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
      args: ['install', '--prod', '--prefer-offline', '--frozen-lockfile', '--ignore-scripts'],
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

  void it('preserves selected pnpm integrity metadata without restoring unrelated runtime dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-artifact-lock-source-'));
    const artifactRoot = mkdtempSync(join(tmpdir(), 'nrb-artifact-lock-stage-'));
    roots.push(root, artifactRoot);
    writeBackendOutputs(root);
    const app = join(root, 'dist/apps/backend/auth/auth-app-api');
    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(join(app, 'package.json'), JSON.stringify({ ...manifest, packageManager: 'pnpm@12.8.1' }));
    const environment = {
      lockfileVersion: '9.0',
      importers: { '.': { packageManagerDependencies: { pnpm: { specifier: '12.8.1', version: '12.8.1' } } } },
      packages: { 'pnpm@12.8.1': { resolution: { integrity: 'sha512-selected-package-manager-integrity' } } },
    };
    const application = {
      lockfileVersion: '9.0',
      importers: { '.': { dependencies: { pg: { specifier: '1.0.0', version: '1.0.0' } } } },
      packages: { 'pg@1.0.0': { resolution: { integrity: 'sha512-pruned-application-integrity' } } },
    };
    const selectedPolicy = {
      settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
      overrides: { pg: '1.0.0' },
      packageExtensionsChecksum: 'sha256-selected-package-extensions',
    };
    mkdirSync(join(root, '.nrb/closure'), { recursive: true });
    writeFileSync(
      join(root, '.nrb/closure/pnpm-lock.yaml'),
      `${JSON.stringify(environment)}\n---\n${JSON.stringify({ ...application, ...selectedPolicy, packages: { 'unselected-browser@1.0.0': {} } })}\n`,
    );
    const generatedApplication = {
      ...application,
      importers: {
        '.': {
          dependencies: {
            ...application.importers['.'].dependencies,
            dataloader: { specifier: '2.2.3', version: '2.2.3' },
          },
        },
      },
    };
    writeFileSync(join(app, 'pnpm-lock.yaml'), `${JSON.stringify(generatedApplication)}\n`);

    const stage = (): void => {
      stageDeploymentArtifact({
        workspaceRoot: root,
        artifactRoot,
        graph: graph(),
        closure: closure(),
        project: 'auth-app-api',
      });
      const documents = parseAllDocuments(readFileSync(join(artifactRoot, 'pnpm-lock.yaml'), 'utf8'));
      assert.deepEqual(
        documents.map((document) => document.toJSON()),
        [environment, { ...application, ...selectedPolicy }],
      );
      assert.equal(readFileSync(join(artifactRoot, 'pnpm-workspace.yaml'), 'utf8'), "packages:\n  - '.'\n");
    };
    stage();
    // Future Nx versions may already retain this document; staging must replace
    // it with the selected metadata rather than append a third document.
    writeFileSync(join(app, 'pnpm-lock.yaml'), `${JSON.stringify(environment)}\n---\n${JSON.stringify(application)}\n`);
    stage();

    writeFileSync(join(root, '.nrb/closure/pnpm-lock.yaml'), JSON.stringify(application));
    assert.throws(stage, /missing package-manager integrity metadata/u);
    writeFileSync(join(app, 'pnpm-lock.yaml'), 'broken: [\n');
    assert.throws(stage, /invalid pnpm lockfile/u);
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
    const { environment, application } = writeSelectedRuntimeLock(root, [
      '@fastify/static',
      'fastify',
      'unselected-browser',
    ]);
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
      packageManager: string;
      dependencies: Record<string, string>;
    };
    assert.equal(artifact.kind, 'site');
    assert.deepEqual(artifact.outputPaths, ['dist/apps/frontend/site']);
    assert.equal(manifest.name, 'site-app');
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.packageManager, 'pnpm@12.8.1');
    assert.deepEqual(manifest.dependencies, { '@fastify/static': '1.0.0', fastify: '1.0.0' });
    assert.ok(deploymentInstallPlan(artifact).args.includes('--frozen-lockfile'));
    assert.deepEqual(
      parseAllDocuments(readFileSync(join(artifactRoot, 'pnpm-lock.yaml'), 'utf8')).map((document) =>
        document.toJSON(),
      ),
      [
        environment,
        {
          ...application,
          importers: {
            '.': {
              dependencies: {
                '@fastify/static': application.importers['.'].dependencies['@fastify/static'],
                fastify: application.importers['.'].dependencies.fastify,
              },
            },
          },
        },
      ],
    );
    assert.equal(
      readFileSync(join(artifactRoot, 'pnpm-workspace.yaml'), 'utf8'),
      readFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), 'utf8'),
    );

    const stage = () =>
      stageDeploymentArtifact({
        workspaceRoot: root,
        artifactRoot,
        graph: siteGraph(),
        closure: siteClosure(),
        project: 'site-app',
      });
    writeSelectedRuntimeLock(root, ['fastify']);
    assert.throws(stage, /no locked dependency for @fastify\/static/u);
    rmSync(join(root, '.nrb/closure/package.json'));
    assert.throws(stage, /Selected package manifest is missing/u);
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
    const { environment, application } = writeSelectedRuntimeLock(root, ['pg', 'mongodb'], ['jiti', 'unselected-tool']);

    stageSelectedMigratorManifest(root, artifactRoot, closure('postgres'));
    const manifest = JSON.parse(readFileSync(join(artifactRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      packageManager: string;
    };
    assert.deepEqual(manifest.dependencies, { pg: '1.0.0', jiti: '1.0.0' });
    assert.equal(manifest.packageManager, 'pnpm@12.8.1');
    assert.deepEqual(
      parseAllDocuments(readFileSync(join(artifactRoot, 'pnpm-lock.yaml'), 'utf8')).map((document) =>
        document.toJSON(),
      ),
      [
        environment,
        {
          ...application,
          importers: {
            '.': {
              dependencies: {
                pg: application.importers['.'].dependencies.pg,
                jiti: application.importers['.'].devDependencies.jiti,
              },
            },
          },
        },
      ],
    );
    writeFileSync(join(root, '.nrb/closure/pnpm-lock.yaml'), JSON.stringify(application));
    assert.throws(
      () => stageSelectedMigratorManifest(root, artifactRoot, closure('postgres')),
      /missing package-manager integrity metadata/u,
    );
  });

  void it('removes NODE_PATH from the artifact process environment', () => {
    const base = { NODE_PATH: '/workspace/libs/backend/node_modules', PATH: '/usr/bin', EXTRA_ENV: '1' };
    const environment = isolatedRuntimeEnvironment(base);
    assert.equal(environment.NODE_PATH, undefined);
    assert.equal(environment.PATH, '/usr/bin');
    assert.equal(environment.EXTRA_ENV, '1');
  });
});
