// @requirements REQ-RUNTIME-DELIVERY-009, REQ-RUNTIME-OBSERVABILITY-005
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { parse } from 'yaml';
import { buildDeployPlan } from './deploy.mjs';
import {
  helmVersion,
  mongoImage,
  generatableSecrets,
  helmValueFiles,
  publicApps,
  observabilityImages,
} from './delivery-inventory.mjs';
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

test('the GitLab pipeline pins the Helm release', () => {
  const version = helmVersion.replace(/^v/u, '');
  assert.match(read('.gitlab-ci.yml'), new RegExp(`helm-v${version}-linux-amd64\\.tar\\.gz`));
  assert.doesNotMatch(read('.gitlab-ci.yml'), /helm-v4\\.2\\.2/);
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

test('reference monitoring pins agree across Compose and Helm without duplicate providers', () => {
  const compose = parse(read('docker/docker-compose.prod.yml'));
  const helm = parse(read('.helm/values.yaml'));
  for (const service of ['otel-collector', 'prometheus', 'alertmanager', 'grafana']) {
    assert.equal(compose.services[service].image, observabilityImages[service]);
    assert.match(observabilityImages[service], /@sha256:[a-f0-9]{64}$/u);
  }
  for (const [name, image] of [
    ['otel-collector', helm.monitoring.otelCollector.image],
    ['coroot', helm.coroot.image],
  ]) {
    assert.equal(`${image.repository}:${image.tag}`, observabilityImages[name]);
  }
  assert.equal(
    compose.services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD__FILE,
    '/run/secrets/grafana_admin_password',
  );
  assert.equal(compose.services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD_FILE, undefined);
  const dashboards = parse(read('docker/grafana/provisioning/dashboards/dashboards.yml'));
  assert.equal(dashboards.providers.length, 1);
  assert.equal(dashboards.providers[0].options.path, '/var/lib/grafana/dashboards');
  for (const duplicate of ['dashboards/dashboards.yaml', 'datasources/datasources.yaml']) {
    assert.equal(existsSync(join(rootDir, 'docker/grafana/provisioning', duplicate)), false);
  }
  const datasources = parse(read('docker/grafana/provisioning/datasources/datasources.yml'));
  assert.deepEqual(datasources.datasources.map((row) => row.uid).sort(), ['alertmanager', 'prometheus']);
  const alertmanager = parse(read('docker/alertmanager/alertmanager.yml'));
  assert.deepEqual(alertmanager.receivers, [
    { name: 'default' },
    { name: 'critical-alerts' },
    { name: 'warning-alerts' },
  ]);
  assert.doesNotMatch(read('docker/alertmanager/alertmanager.yml'), /\$\{/u);
  const collector = parse(read('docker/otel-collector-config.yaml'));
  assert.deepEqual(collector.processors.resource.attributes, [
    { key: 'deployment.environment', value: '${env:NODE_ENV}', action: 'upsert' },
  ]);
  assert.equal(compose.services['otel-collector'].environment.NODE_ENV, 'production');
  assert.equal(compose.services['otel-collector'].healthcheck, undefined);
});

test('image promotion is the Node updater only', () => {
  assert.equal(existsSync(join(rootDir, 'scripts/update-deploy-tags.py')), false);
  assert.match(read('scripts/deploy.mjs'), /update-deploy-tags\.mjs/);
  assert.doesNotMatch(read('scripts/deploy.mjs'), /update-deploy-tags\.py/);
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
