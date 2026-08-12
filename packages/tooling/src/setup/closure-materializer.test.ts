// @requirements REQ-SCAFFOLD-SELECTION-002
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { SelectedClosureManifest } from './closure.js';
import {
  checkClosureArtifacts,
  renderClosureCaddyfile,
  renderClosureHelmValues,
  renderClosureSingleDomainCaddyfile,
  synchronizeClosureArtifacts,
} from './closure-materializer.js';

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'nrb-closure-materializer-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@11.11.0', engines: { node: '>=24 <25', pnpm: '11.11.0' } }),
  );
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n\noverrides:\n  typescript: 6.0.3\n");
  return root;
}

function closure(provider: 'postgres' | 'mongodb' | null): SelectedClosureManifest {
  const packageName = provider === 'postgres' ? 'pg' : provider === 'mongodb' ? 'mongodb' : 'react';
  return {
    schemaVersion: 1,
    configHash: 'a'.repeat(64),
    graphDigest: (provider === 'postgres' ? 'b' : provider === 'mongodb' ? 'c' : 'd').repeat(64),
    provider,
    roots: ['landing-app'],
    projects: ['landing-app'],
    targets: { build: ['landing-app'] },
    productExternalPackages: { [packageName]: '1.0.0' },
    toolingExternalPackages: { nx: '23.1.0' },
    externalPackages: { [packageName]: '1.0.0', nx: '23.1.0' },
    services: ['landing-app'],
    releaseImages: ['landing-app'],
    product: {
      ciMode: 'product',
      frontendApiMode: 'same-origin',
      mobileTargets: ['web'],
    },
    deployment: {
      targets: ['docker'],
      publicDomain: 'example.com',
      primaryApp: null,
      publicTopology: 'single-domain',
      kubernetesDelivery: 'direct',
      infrastructure: { redis: 'bundled', nats: 'bundled', s3: 'bundled' },
    },
  };
}

describe('closure materializer', () => {
  it('writes only the selected package manifest and preserves pnpm policy', () => {
    const root = fixtureRoot();
    try {
      const result = synchronizeClosureArtifacts(root, closure('postgres'));
      const packageManifest = readFileSync(join(root, '.nrb/closure/package.json'), 'utf8');
      const parsedPackage = JSON.parse(packageManifest) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      const workspace = readFileSync(join(root, '.nrb/closure/pnpm-workspace.yaml'), 'utf8');
      const helmValues = readFileSync(join(root, '.helm/values-selection.yaml'), 'utf8');
      const caddyfile = readFileSync(join(root, '.nrb/Caddyfile.per-app-domains'), 'utf8');
      const singleDomainCaddyfile = readFileSync(join(root, '.nrb/Caddyfile.single-domain'), 'utf8');
      assert.equal(result.changed, true);
      assert.match(packageManifest, /"pg": "1.0.0"/u);
      assert.doesNotMatch(packageManifest, /mongodb/u);
      assert.deepEqual(parsedPackage.dependencies, { pg: '1.0.0' });
      assert.deepEqual(parsedPackage.devDependencies, { nx: '23.1.0' });
      assert.match(workspace, /packages:\n {2}- '\.'/u);
      assert.match(workspace, /overrides:\n {2}typescript: 6.0.3/u);
      assert.doesNotMatch(workspace, /apps\/\*/u);
      assert.match(helmValues, /selectedApps:\n {4}- landing-app/u);
      assert.match(helmValues, /provider: postgres/u);
      assert.match(helmValues, /deploymentTargets: \[docker\]/u);
      assert.match(helmValues, /infrastructure:\n {4}redis: bundled/u);
      assert.match(helmValues, /landingApp:\n {4}enabled: true/u);
      assert.match(helmValues, /authAppApi:\n {4}enabled: false/u);
      assert.match(caddyfile, /LANDING_APP_DOMAIN/u);
      assert.doesNotMatch(caddyfile, /AUTH_APP_API_DOMAIN|auth-app-api:80/u);
      assert.doesNotMatch(singleDomainCaddyfile, /routes\/core|auth-app-api:80/u);
      assert.equal(checkClosureArtifacts(root, closure('postgres')).valid, true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('disables database and migration values for a provider-free frontend closure', () => {
    const values = renderClosureHelmValues(closure(null));
    assert.match(values, /provider: ''/u);
    assert.match(values, /engine: ''/u);
    assert.match(values, /migrations:\n {2}enabled: false/u);
    assert.match(values, /monitoring:\n {2}enabled: false/u);
  });

  it('renders only selected public Caddy sites and API routes', () => {
    const selected = closure('postgres');
    selected.roots = ['auth-app-api', 'user-app', 'user-app-api'];
    selected.releaseImages = ['auth-app-api', 'migrator', 'user-app', 'user-app-api'];
    const caddyfile = renderClosureCaddyfile(selected);
    assert.match(caddyfile, /AUTH_APP_API_DOMAIN[\s\S]*auth-app-api:80/u);
    assert.match(caddyfile, /USER_APP_DOMAIN[\s\S]*user-app:8080/u);
    assert.doesNotMatch(caddyfile, /ADMIN_APP_DOMAIN|LANDING_APP_DOMAIN/u);
    const singleDomainCaddyfile = renderClosureSingleDomainCaddyfile(selected);
    assert.match(singleDomainCaddyfile, /routes\/core\/auth\.caddy/u);
    assert.match(singleDomainCaddyfile, /routes\/core\/user\.caddy/u);
    assert.doesNotMatch(singleDomainCaddyfile, /routes\/core\/admin\.caddy|admin-app-api:80/u);
  });

  it('disables ingress for a background-only selected closure', () => {
    const selected = closure('postgres');
    selected.releaseImages = ['migrator', 'notification-scheduler'];
    assert.match(renderClosureHelmValues(selected), /ingress:\n {2}enabled: false/u);
  });

  it('derives the ingress host table from the configured domain and apex owner', () => {
    const selected = closure('postgres');
    selected.deployment.publicDomain = 'dehqonhub.uz';
    selected.deployment.primaryApp = 'site-app';
    selected.releaseImages = ['migrator', 'site-app', 'user-app', 'user-app-api'];
    const values = renderClosureHelmValues(selected);

    assert.match(
      values,
      /ingress:\n {2}hosts:\n {4}- host: dehqonhub\.uz\n {6}service: site-app\n {6}paths: \['\/'\]/u,
    );
    assert.match(values, / {4}- host: user-app\.dehqonhub\.uz\n {6}service: user-app\n/u);
    assert.match(values, / {4}- host: user-app-api\.dehqonhub\.uz\n {6}service: user-app-api\n/u);
    assert.doesNotMatch(values, /site-app\.dehqonhub\.uz/u);
    assert.doesNotMatch(values, /example\.com/u);
    // The chart's example.com certificate cannot cover these hosts, so the overlay clears it and
    // lets the chart derive one from the generated table.
    assert.match(values, / {2}tls: \[\]\n/u);
  });

  it('keeps every app on a subdomain when no app owns the apex', () => {
    const selected = closure('postgres');
    selected.deployment.publicDomain = 'dehqonhub.uz';
    selected.deployment.primaryApp = null;
    selected.releaseImages = ['landing-app', 'migrator'];
    const values = renderClosureHelmValues(selected);

    assert.match(values, / {4}- host: landing-app\.dehqonhub\.uz\n {6}service: landing-app\n/u);
    assert.doesNotMatch(values, /- host: dehqonhub\.uz\n/u);
  });

  it('is idempotent and invalidates a selected lock on provider swap', () => {
    const root = fixtureRoot();
    try {
      synchronizeClosureArtifacts(root, closure('postgres'));
      mkdirSync(join(root, '.nrb/closure'), { recursive: true });
      writeFileSync(join(root, '.nrb/closure/pnpm-lock.yaml'), 'lockfileVersion: 9\n');
      writeFileSync(join(root, '.nrb/closure/lock.json'), '{}\n');
      assert.equal(synchronizeClosureArtifacts(root, closure('postgres')).changed, false);
      const swapped = synchronizeClosureArtifacts(root, closure('mongodb'));
      assert.equal(swapped.changed, true);
      assert.equal(swapped.invalidatedLock, true);
      assert.throws(() => readFileSync(join(root, '.nrb/closure/pnpm-lock.yaml'), 'utf8'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
