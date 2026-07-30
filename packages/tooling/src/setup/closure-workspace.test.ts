// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { SelectedClosureManifest } from './closure.js';
import { appCatalog, capabilityCatalog, type DurableDatabaseProviderId } from './catalog.js';
import {
  materializeAllReferenceClosure,
  referenceLockInvocation,
  referenceClosureContextPath,
  validateCurrentClosure,
} from './closure-workspace.js';
import { configHash } from './state.js';
import { parseNrbConfig, schemaVersion } from './schema.js';
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

function referenceFixture(provider: DurableDatabaseProviderId): SelectedClosureManifest {
  const apps = Object.keys(appCatalog).sort() as Array<keyof typeof appCatalog>;
  const capabilities = Object.keys(capabilityCatalog)
    .filter((capability) => capability !== (provider === 'postgres' ? 'mongodb' : 'postgres'))
    .sort() as Array<keyof typeof capabilityCatalog>;
  const config = parseNrbConfig({
    schemaVersion,
    apps,
    capabilities,
    product: { ciMode: 'maintainer', frontendApiMode: 'same-origin', mobileTargets: ['web'] },
    options: { prune: false, force: false, dryRun: false, nonInteractive: true },
  });
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
