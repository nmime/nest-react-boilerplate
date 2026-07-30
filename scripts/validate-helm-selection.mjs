#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(import.meta.dirname, '..');
const chartDir = join(rootDir, '.helm');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-helm-selection-'));
const outputOptionIndex = process.argv.indexOf('--write-all-reference-dir');
const allReferenceOutputDirectory = outputOptionIndex >= 0 ? process.argv[outputOptionIndex + 1] : undefined;
if (outputOptionIndex >= 0 && !allReferenceOutputDirectory) {
  throw new Error('--write-all-reference-dir requires a directory.');
}

const appKeys = {
  'admin-app': 'adminApp',
  'admin-app-api': 'adminAppApi',
  'auth-app-api': 'authAppApi',
  'discord-app-api': 'discordAppApi',
  'landing-app': 'landingApp',
  'mobile-app': 'mobileApp',
  'notification-consumer': 'notificationConsumer',
  'notification-scheduler': 'notificationScheduler',
  'site-app': 'siteApp',
  'telegram-bot-api': 'telegramBotApi',
  'user-app': 'userApp',
  'user-app-api': 'userAppApi',
};

function selectionValues(name, apps, provider = '', directory = temporaryDirectory) {
  const selected = new Set(apps);
  const path = join(directory, `${name}.yaml`);
  const values = [
    'deployment:',
    '  selectedApps:',
    ...apps.map((app) => `    - ${app}`),
    `  provider: ${provider || "''"}`,
    'database:',
    `  engine: ${provider || "''"}`,
    'migrations:',
    `  enabled: ${Boolean(provider)}`,
    'apps:',
    ...Object.entries(appKeys).flatMap(([app, key]) => [`  ${key}:`, `    enabled: ${selected.has(app)}`]),
  ];
  writeFileSync(path, `${values.join('\n')}\n`);
  return path;
}

function template(name, values, extra = [], expectSuccess = true) {
  const result = spawnSync('helm', ['template', name, chartDir, '-f', values, ...extra], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (expectSuccess && result.status !== 0) throw new Error(result.stderr || result.stdout);
  if (!expectSuccess && result.status === 0) throw new Error(`${name} unexpectedly rendered successfully.`);
  return expectSuccess ? result.stdout : result.stderr || result.stdout;
}

try {
  const providerFree = template('provider-free', selectionValues('provider-free', ['landing-app']), [
    '--set',
    'ingress.enabled=true',
  ]);
  const providerFreeIngress = providerFree.split(/^---\s*$/mu).find((document) => /^kind: Ingress$/mu.test(document));
  assert.ok(providerFreeIngress);
  assert.match(providerFree, /kind: Deployment[\s\S]*component: landing-app/u);
  assert.match(providerFreeIngress, /host: "example.com"/u);
  assert.doesNotMatch(providerFree, /kind: Job|DATABASE_ENGINE|POSTGRES_|MONGODB_|component: .*app-api/u);
  assert.doesNotMatch(providerFreeIngress, /auth-app-api\.example\.com|user-app\.example\.com/u);

  const postgres = template(
    'postgres-selected',
    selectionValues('postgres', ['auth-app-api', 'user-app-api'], 'postgres'),
    ['--set-string', 'secrets.existingSecret=runtime-postgres'],
  );
  assert.match(postgres, /kind: Job[\s\S]*component: migrate/u);
  assert.match(postgres, /DATABASE_ENGINE:\s+"postgres"/u);
  assert.doesNotMatch(postgres, /component: (admin-app-api|landing-app)/u);

  const mongodb = template('mongodb-selected', selectionValues('mongodb', ['auth-app-api'], 'mongodb'), [
    '--set-string',
    'database.mongodb.replicaSet=fixture-rs',
    '--set-string',
    'secrets.existingSecret=runtime-mongodb',
    '--set-string',
    'migrations.mongodbExistingSecret=migration-mongodb',
  ]);
  assert.match(mongodb, /DATABASE_ENGINE:\s+"mongodb"/u);
  assert.match(mongodb, /name: migration-mongodb/u);
  assert.doesNotMatch(mongodb, /POSTGRES_/u);

  const custom = selectionValues('custom', ['site-app']);
  const customRender = template('custom-selected', custom);
  assert.match(customRender, /component: site-app/u);
  assert.doesNotMatch(customRender, /component: landing-app/u);
  assert.match(
    template('custom-leak', custom, ['--set', 'apps.authAppApi.enabled=true'], false),
    /enables unselected application auth-app-api/u,
  );

  if (allReferenceOutputDirectory) {
    const apps = Object.keys(appKeys);
    selectionValues('provider-free-selected', ['landing-app'], '', allReferenceOutputDirectory);
    selectionValues('postgres-all-reference', apps, 'postgres', allReferenceOutputDirectory);
    selectionValues('mongodb-all-reference', apps, 'mongodb', allReferenceOutputDirectory);
  }

  console.log('Helm closure selection fixtures passed (provider-free, PostgreSQL, MongoDB, custom).');
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
