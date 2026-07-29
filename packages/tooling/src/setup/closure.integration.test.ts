import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { buildSelectedClosure, createLiveProjectGraph, providerExternalPackages } from './closure.js';
import { buildAllReferenceClosure } from './closure-workspace.js';

const configHash = 'c'.repeat(64);

describe('selected closure live Nx graph', () => {
  it('resolves provider-free and configured PostgreSQL closures without opposite providers', async () => {
    const graph = await createLiveProjectGraph();
    const providerFree = buildSelectedClosure(graph, { apps: ['landing-app'], capabilities: ['otel'], configHash });
    const postgres = buildSelectedClosure(graph, {
      apps: ['auth-app-api', 'user-app-api'],
      capabilities: ['postgres'],
      configHash,
    });
    assert.equal(providerFree.provider, null);
    assert.deepEqual(providerFree.releaseImages, ['landing-app']);
    assert.ok(
      Object.keys(providerFree.productExternalPackages ?? {}).every((name) => !['pg', 'mongodb'].includes(name)),
    );
    assert.equal(providerFree.productExternalPackages?.['@opentelemetry/instrumentation-pg'], undefined);
    assert.equal(providerFree.productExternalPackages?.['@opentelemetry/instrumentation-mongodb'], undefined);
    assert.ok(postgres.projects.some((name) => name.includes('backend-postgres')));
    assert.ok(postgres.projects.every((name) => !name.includes('backend-mongodb')));
    assert.ok(postgres.productExternalPackages?.pg);
    assert.ok(postgres.productExternalPackages?.['@opentelemetry/instrumentation-pg']);
    assert.equal(postgres.productExternalPackages?.['@opentelemetry/instrumentation-mongodb'], undefined);
    assertNoProviderPackages(postgres.productExternalPackages, providerExternalPackages('mongodb'));
    assert.deepEqual(postgres.releaseImages, ['auth-app-api', 'migrator', 'user-app-api']);
    const site = buildSelectedClosure(graph, { apps: ['site-app'], capabilities: [], configHash });
    const notificationPostgres = buildSelectedClosure(graph, {
      apps: ['auth-app-api', 'notification-consumer', 'notification-scheduler'],
      capabilities: ['notifications', 'postgres'],
      configHash,
    });
    const workspaceRoot = new URL('../../../../', import.meta.url);
    const siteRuntimeDependencies = JSON.parse(
      readFileSync(new URL('apps/frontend/site/runtime-dependencies.json', workspaceRoot), 'utf8'),
    ) as string[];
    const migratorManifest = JSON.parse(
      readFileSync(new URL('docker/migrator-package.json', workspaceRoot), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    assertRuntimeDependenciesSelected(
      site,
      Object.fromEntries(siteRuntimeDependencies.map((name) => [name, name])),
      new Set(),
    );
    assertRuntimeDependenciesSelected(
      notificationPostgres,
      migratorManifest.dependencies,
      providerExternalPackages('mongodb'),
    );
  });

  it('materializes explicit PostgreSQL and MongoDB all-reference closures without provider leakage', async () => {
    const graph = await createLiveProjectGraph();
    const postgres = await buildAllReferenceClosure('postgres', graph);
    const mongodb = await buildAllReferenceClosure('mongodb', graph);

    assert.equal(postgres.provider, 'postgres');
    assert.equal(mongodb.provider, 'mongodb');
    assert.equal(postgres.roots.length, 13);
    assert.deepEqual(postgres.releaseImages, mongodb.releaseImages);
    assert.equal(postgres.releaseImages.length, 13);
    assert.ok(postgres.services.includes('migrate'));
    assert.ok(!postgres.services.includes('mongodb-migrate'));
    assert.ok(mongodb.services.includes('mongodb-migrate'));
    assert.ok(!mongodb.services.includes('migrate'));
    assert.ok(postgres.projects.every((project) => !project.includes('backend-mongodb')));
    assert.ok(mongodb.projects.every((project) => !project.includes('backend-postgres')));
    assert.ok(postgres.productExternalPackages?.['@opentelemetry/instrumentation-pg']);
    assert.equal(postgres.productExternalPackages?.['@opentelemetry/instrumentation-mongodb'], undefined);
    assert.ok(mongodb.productExternalPackages?.mongodb);
    assert.ok(mongodb.productExternalPackages?.['@opentelemetry/instrumentation-mongodb']);
    assert.equal(mongodb.productExternalPackages?.['@opentelemetry/instrumentation-pg'], undefined);
    assertNoProviderPackages(postgres.productExternalPackages, providerExternalPackages('mongodb'));
    assertNoProviderPackages(mongodb.productExternalPackages, providerExternalPackages('postgres'));
    const workspaceRoot = new URL('../../../../', import.meta.url);
    const migratorManifest = JSON.parse(
      readFileSync(new URL('docker/migrator-package.json', workspaceRoot), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    assertRuntimeDependenciesSelected(
      mongodb,
      migratorManifest.dependencies,
      new Set([...providerExternalPackages('postgres'), 'reflect-metadata']),
    );
    assert.ok((postgres.targets.test?.length ?? 0) > postgres.roots.length);
    assert.ok((mongodb.targets.test?.length ?? 0) > mongodb.roots.length);
  });

  it('keeps frontend app dependencies in the platform manifest while Nx owns application identity', async () => {
    const graph = await createLiveProjectGraph();
    const workspaceRoot = new URL('../../../../', import.meta.url);
    const frontendManifest = readManifest(new URL('libs/frontend/package.json', workspaceRoot));
    const landingManifest = readManifest(new URL('apps/frontend/landing/package.json', workspaceRoot));
    const mobileManifest = readManifest(new URL('apps/frontend/mobile/package.json', workspaceRoot));
    const rootManifest = readManifest(new URL('package.json', workspaceRoot));
    const dependencyOwners = new Set([
      ...Object.keys(frontendManifest.dependencies),
      ...Object.keys(frontendManifest.devDependencies),
      ...Object.keys(landingManifest.dependencies),
      ...Object.keys(landingManifest.devDependencies),
      ...Object.keys(mobileManifest.dependencies),
      ...Object.keys(mobileManifest.devDependencies),
      ...Object.keys(rootManifest.dependencies),
      ...Object.keys(rootManifest.devDependencies),
    ]);
    const apps = [
      ['admin-app', 'apps/frontend/admin', false],
      ['user-app', 'apps/frontend/app', false],
      ['landing-app', 'apps/frontend/landing', true],
      ['site-app', 'apps/frontend/site', false],
      ['mobile-app', 'apps/frontend/mobile', true],
    ] as const;
    const selectedByApp = new Map<string, Set<string>>();

    for (const [appId, appRoot, hasRendererDependencyBoundary] of apps) {
      const closure = buildSelectedClosure(graph, { apps: [appId], capabilities: [], configHash });
      const selectedDependencies = new Set(Object.keys(closure.productExternalPackages ?? {}));
      selectedByApp.set(appId, selectedDependencies);
      assert.deepEqual(
        [...selectedDependencies].filter(
          (dependency) => !dependencyOwners.has(dependency) && !dependency.startsWith('@types/'),
        ),
        [],
      );
      const appManifestUrl = new URL(`${appRoot}/package.json`, workspaceRoot);
      assert.equal(existsSync(appManifestUrl), hasRendererDependencyBoundary);
      if (hasRendererDependencyBoundary) {
        const appManifest = JSON.parse(readFileSync(appManifestUrl, 'utf8')) as Record<string, unknown>;
        assert.equal(appManifest.name, undefined);
        assert.equal(appManifest.version, undefined);
        assert.equal(appManifest.scripts, undefined);
        assert.ok(appManifest.devDependencies);
      }
    }

    assert.equal(selectedByApp.get('user-app')?.has('@tma.js/sdk-react'), true);
    assert.equal(selectedByApp.get('admin-app')?.has('@tma.js/sdk-react'), false);
    assert.equal(selectedByApp.get('landing-app')?.has('astro'), true);
    assert.equal(selectedByApp.get('site-app')?.has('vike'), true);
    assert.equal(selectedByApp.get('mobile-app')?.has('expo'), true);
  });
});

function readManifest(url: URL): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  const manifest = JSON.parse(readFileSync(url, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { dependencies: manifest.dependencies ?? {}, devDependencies: manifest.devDependencies ?? {} };
}

function assertRuntimeDependenciesSelected(
  closure: ReturnType<typeof buildSelectedClosure>,
  dependencies: Readonly<Record<string, string>>,
  excluded: ReadonlySet<string>,
): void {
  const missing = Object.keys(dependencies).filter(
    (dependency) => !excluded.has(dependency) && closure.externalPackages[dependency] === undefined,
  );
  assert.deepEqual(missing, []);
}

function assertNoProviderPackages(
  packages: Readonly<Record<string, string>> | undefined,
  forbidden: ReadonlySet<string>,
): void {
  assert.deepEqual(
    Object.keys(packages ?? {}).filter((name) => forbidden.has(name)),
    [],
  );
}
