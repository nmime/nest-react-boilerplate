// @requirements REQ-SCAFFOLD-SELECTION-002 REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { ProjectGraphLike, SelectedClosureManifest } from './closure.js';
import { expandDependencies, validateSelection, type DurableDatabaseProviderId } from './catalog.js';
import {
  allReferenceConfig,
  assertReferenceSelectionIsValid,
  configuredClosureGraph,
  excludedReferenceProjects,
  materializeAllReferenceClosure,
  referenceCapabilities,
  referenceLockInvocation,
  referenceClosureContextPath,
  validateCurrentClosure,
} from './closure-workspace.js';
import { configHash } from './state.js';
import { parseNrbConfig } from './schema.js';
import { defaultOperationalFields } from './test-fixtures.js';

function closure(overrides: Partial<SelectedClosureManifest> = {}): SelectedClosureManifest {
  return {
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64),
    provider: null,
    roots: ['landing-app'],
    projects: ['landing-app'],
    targets: { build: ['landing-app'], serve: ['landing-app'] },
    productExternalPackages: { astro: '6.0.0' },
    toolingExternalPackages: { nx: '23.1.0' },
    externalPackages: { astro: '6.0.0', nx: '23.1.0' },
    services: ['landing-app'],
    releaseImages: ['landing-app'],
    ...defaultOperationalFields(),
    ...overrides,
  };
}

describe('current closure validation', () => {
  it('returns a closure only when config and live graph are current', async () => {
    const current = closure();
    assert.equal(
      await validateCurrentClosure('/offline', {
        readActual: () => current,
        buildExpected: async () => closure(),
      }),
      current,
    );
  });

  it('fails stale config hash with setup repair instructions', async () => {
    await assert.rejects(
      validateCurrentClosure('/offline', {
        readActual: () => closure(),
        buildExpected: async () => closure({ configHash: 'c'.repeat(64) }),
      }),
      /config hash is stale; rerun `pnpm nrb setup`/u,
    );
  });

  it('fails stale live graph digest with setup repair instructions', async () => {
    await assert.rejects(
      validateCurrentClosure('/offline', {
        readActual: () => closure(),
        buildExpected: async () => closure({ graphDigest: 'd'.repeat(64) }),
      }),
      /live graph digest is stale; rerun `pnpm nrb setup`/u,
    );
  });

  it('fails other ownership drift without accepting matching digests alone', async () => {
    await assert.rejects(
      validateCurrentClosure('/offline', {
        readActual: () => closure(),
        buildExpected: async () => closure({ roots: ['site-app'] }),
      }),
      /does not match current setup and Nx ownership/u,
    );
  });
});

describe('all-reference closure context', () => {
  it('projects checked-in application edges onto the selected reference provider', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-reference-graph-'));
    mkdirSync(join(root, '.nrb'));
    writeFileSync(join(root, '.nrb/workspace.json'), JSON.stringify({ mode: 'all-reference', provider: 'mongodb' }));
    const graph: ProjectGraphLike = {
      nodes: {
        'auth-app-api': { data: {} },
        '@app/backend-common-bootstrap': { data: {} },
        '@app/backend-mongodb-main': { data: {} },
        '@app/backend-postgres-main': { data: {} },
      },
      dependencies: {
        'auth-app-api': [
          { target: '@app/backend-common-bootstrap' },
          { target: '@app/backend-mongodb-main' },
          { target: '@app/backend-postgres-main' },
        ],
      },
    };

    try {
      const projected = configuredClosureGraph(root, graph);
      assert.deepEqual(projected.dependencies['auth-app-api'], [
        { target: '@app/backend-common-bootstrap' },
        { target: '@app/backend-mongodb-main' },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  for (const provider of ['postgres', 'mongodb'] as const) {
    it(`materializes a complete isolated ${provider} context without a product selection`, async () => {
      const root = mkdtempSync(join(tmpdir(), `nrb-reference-${provider}-`));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ packageManager: 'pnpm@11.11.0', engines: { node: '>=24 <25' } }),
      );
      writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n\noverrides:\n  nx: 23.1.0\n");
      try {
        const expected = referenceFixture(provider);
        const materialized = await materializeAllReferenceClosure(root, provider, {
          buildClosure: async () => expected,
          generateLock: (contextRoot) => {
            writeFileSync(join(contextRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
          },
        });
        const contextRoot = join(root, referenceClosureContextPath(provider));
        for (const file of [
          'closure.json',
          'Caddyfile.per-app-domains',
          'Caddyfile.single-domain',
          'helm-values.yaml',
          'nrb.config.json',
          'workspace.json',
          'package.json',
          'pnpm-workspace.yaml',
          'pnpm-lock.yaml',
          'lock.json',
        ]) {
          assert.doesNotThrow(() => readFileSync(join(contextRoot, file), 'utf8'), file);
        }
        const writtenConfig = parseNrbConfig(JSON.parse(readFileSync(join(contextRoot, 'nrb.config.json'), 'utf8')));
        const metadata = JSON.parse(readFileSync(join(contextRoot, 'lock.json'), 'utf8')) as Record<string, unknown>;
        assert.equal(materialized.provider, provider);
        assert.equal(configHash(writtenConfig), materialized.configHash);
        assert.equal(metadata.provider, provider);
        assert.equal(metadata.graphDigest, materialized.graphDigest);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('prefers cached metadata but permits a cold runner to resolve the reference lock', () => {
    const invocation = referenceLockInvocation();

    assert.equal(invocation.command, 'pnpm');
    assert.ok(invocation.args.includes('--prefer-offline'));
    assert.ok(invocation.args.includes('--no-frozen-lockfile'));
    assert.ok(!invocation.args.includes('--offline'));
    assert.ok(invocation.args.includes('--ignore-scripts'));
  });
});

describe('reference capability selection', () => {
  for (const provider of ['postgres', 'mongodb'] as const) {
    it(`the ${provider} reference selection survives expansion and validation`, () => {
      const { apps, capabilities } = allReferenceConfig(provider);
      const expanded = expandDependencies(apps, capabilities);

      // Expansion transitively re-adds anything the filter dropped but a survivor still
      // requires, which is how a selection that looked filtered became an unbuildable
      // migrator image instead of a selection error.
      assert.deepEqual(validateSelection(expanded.apps, expanded.capabilities), []);
    });
  }

  it('drops a capability that only transitively reaches an excluded one', () => {
    const catalog = {
      mongodb: { conflictsWith: ['postgres'], requiresCapabilities: [] },
      postgres: { conflictsWith: ['mongodb'], requiresCapabilities: [] },
      restricted: { conflictsWith: ['mongodb'], requiresCapabilities: [] },
      dependent: { conflictsWith: [], requiresCapabilities: ['restricted'] },
      indirect: { conflictsWith: [], requiresCapabilities: ['dependent'] },
      unrelated: { conflictsWith: [], requiresCapabilities: [] },
    };

    assert.deepEqual(referenceCapabilities(catalog, 'mongodb'), ['mongodb', 'unrelated']);
    assert.deepEqual(referenceCapabilities(catalog, 'postgres'), [
      'dependent',
      'indirect',
      'postgres',
      'restricted',
      'unrelated',
    ]);
  });

  it('drops a capability that requires the provider this selection excludes', () => {
    const catalog = {
      mongodb: { conflictsWith: ['postgres'], requiresCapabilities: [] },
      postgres: { conflictsWith: ['mongodb'], requiresCapabilities: [] },
      relational: { conflictsWith: [], requiresCapabilities: ['postgres'] },
    };

    assert.deepEqual(referenceCapabilities(catalog, 'mongodb'), ['mongodb']);
  });

  it('terminates on a requirement cycle instead of looping', () => {
    const catalog = {
      mongodb: { conflictsWith: ['postgres'], requiresCapabilities: [] },
      postgres: { conflictsWith: ['mongodb'], requiresCapabilities: [] },
      left: { conflictsWith: [], requiresCapabilities: ['right'] },
      right: { conflictsWith: [], requiresCapabilities: ['left', 'postgres'] },
    };

    assert.deepEqual(referenceCapabilities(catalog, 'mongodb'), ['mongodb']);
  });

  it('excludes every project a dropped capability owns, on either provider', () => {
    const catalog = {
      mongodb: { conflictsWith: ['postgres'], requiresCapabilities: [], ownedProjects: ['@app/mongodb'] },
      postgres: { conflictsWith: ['mongodb'], requiresCapabilities: [], ownedProjects: ['@app/postgres'] },
      relational: {
        conflictsWith: [],
        requiresCapabilities: ['postgres'],
        ownedProjects: ['@app/relational'],
        providerOwnedProjects: { postgres: ['@app/relational-postgres'], mongodb: ['@app/relational-mongodb'] },
      },
      kept: {
        conflictsWith: [],
        requiresCapabilities: [],
        ownedProjects: ['@app/kept'],
        providerOwnedProjects: { postgres: ['@app/kept-postgres'] },
      },
    };

    // `relational` is out of the mongodb selection entirely, so its postgres-specific projects
    // are out with it. Pruning the opposite provider's projects alone left them reachable from
    // an application and back in the image, while `kept` survives and keeps its own.
    assert.deepEqual(excludedReferenceProjects(catalog, 'mongodb'), [
      '@app/postgres',
      '@app/relational',
      '@app/relational-mongodb',
      '@app/relational-postgres',
    ]);
    assert.deepEqual(excludedReferenceProjects(catalog, 'postgres'), ['@app/mongodb']);
  });

  it('reports an unbuildable reference selection as a selection error', () => {
    const { apps, capabilities } = allReferenceConfig('mongodb');

    assert.throws(() => {
      assertReferenceSelectionIsValid('mongodb', apps, [...capabilities, 'tenancy']);
    }, /mongodb reference selection/u);
  });
});

function referenceFixture(provider: DurableDatabaseProviderId): SelectedClosureManifest {
  // Built from the production selection rather than a restatement of it. This
  // helper used to duplicate the capability filter and silently disagreed with
  // it as soon as `tenancy` declared `conflictsWith: ['mongodb']`.
  const { apps, config } = allReferenceConfig(provider);
  return closure({
    provider,
    configHash: configHash(config),
    roots: apps,
    projects: apps,
    services: provider === 'postgres' ? ['migrate', 'postgres'] : ['mongodb', 'mongodb-init', 'mongodb-migrate'],
    releaseImages: ['migrator'],
    product: config.product,
    deployment: config.deployment,
  });
}
