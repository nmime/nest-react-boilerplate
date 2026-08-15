// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { buildDeployPlan } from './deploy.mjs';
import { helmVersion, mongoImage, generatableSecrets, helmValueFiles, publicApps } from './delivery-inventory.mjs';
import { generatableSecrets as initSecrets } from './compose-production-init.mjs';

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)));
const read = (relative) => readFileSync(join(rootDir, relative), 'utf8');

test('the Compose public app table is exactly the catalog of deployable apps', async () => {
  const jiti = createJiti(import.meta.url);
  const { appCatalog } = await jiti.import('../packages/tooling/src/setup/catalog.ts');
  const expected = Object.values(appCatalog)
    .filter((app) => app.deployable && app.releaseImage?.composePort)
    .map((app) => [
      app.id,
      `${app.id.replaceAll('-', '_').toUpperCase()}_DOMAIN`,
      `${app.id}:${app.releaseImage.composePort}`,
    ]);
  const byAppId = (rows) => [...rows].sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(byAppId(publicApps), byAppId(expected));
});

test('Compose init secrets are the shared inventory, not a second list', () => {
  assert.equal(initSecrets, generatableSecrets);
});

test('both forges pin the same Helm release', () => {
  const version = helmVersion.replace(/^v/u, '');
  assert.match(read('.github/workflows/deploy.yml'), new RegExp(`HELM_VERSION: ${helmVersion}`));
  assert.match(read('.github/workflows/ci.yml'), new RegExp(`HELM_VERSION: ${helmVersion}`));
  assert.match(read('.github/workflows/release-images.yml'), new RegExp(`HELM_VERSION: ${helmVersion}`));
  assert.match(read('.gitlab-ci.yml'), new RegExp(`helm-v${version}-linux-amd64\\.tar\\.gz`));
  assert.doesNotMatch(read('.gitlab-ci.yml'), /helm-v4\.2\.2/);
});

test('Mongo images share one pin', () => {
  const sources = [
    'docker/docker-compose.yml',
    'docker/docker-compose.prod.mongodb-bundled-db.yml',
    'docker-compose.yml',
    'scripts/smoke-compose-database-modes.mjs',
  ];
  for (const source of sources) {
    assert.match(read(source), new RegExp(mongoImage.replaceAll('.', '\\.')), source);
    assert.doesNotMatch(read(source), /mongo:8\.0\.12/, source);
  }
});

test('image promotion is the Node updater only', () => {
  assert.equal(existsSync(join(rootDir, 'scripts/update-deploy-tags.py')), false);
  assert.match(read('.github/workflows/deploy.yml'), /node scripts\/update-deploy-tags\.mjs/);
  assert.doesNotMatch(read('.github/workflows/deploy.yml'), /update-deploy-tags\.py/);
});

test('helm plan applies the selection overlay last', () => {
  const plan = buildDeployPlan({
    target: 'helm',
    namespace: 'acme',
    releaseName: 'acme',
    skipValidate: true,
  });
  const upgrade = plan.steps.find((step) => step.title.includes('Helm release'));
  assert.ok(upgrade, 'helm plan must include the upgrade step');
  assert.deepEqual(
    helmValueFiles.flatMap((file) => ['-f', file]),
    upgrade.args.slice(upgrade.args.indexOf('-f'), upgrade.args.indexOf('--atomic')),
  );
});
