#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = process.cwd();
const toolingBin = resolve(workspaceRoot, 'packages/tooling/bin/repo-tooling.mjs');
const closureContext = resolve(workspaceRoot, '.nrb/closure');

function runJson(args) {
  const result = spawnSync(process.execPath, [toolingBin, ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, NRB_CLOSURE_CONTEXT: closureContext, NX_DAEMON: 'false' },
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Onboarding command failed: nrb ${args.join(' ')}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Onboarding command did not return JSON: nrb ${args.join(' ')}`, {
      cause: error,
    });
  }
}

const doctor = runJson(['doctor', '--json']);
assert.equal(doctor.summary?.fail, 0, 'Workspace doctor must have zero failures.');

const requiredDoctorChecks = ['runtime-version', 'pnpm', 'manifests', 'lock-file', 'nx-graph', 'tooling-package'];
for (const name of requiredDoctorChecks) {
  const check = doctor.checks?.find((entry) => entry.name === name);
  assert.equal(check?.status, 'pass', `Doctor check must pass: ${name}`);
}

const presetExpectations = {
  minimal: ['acceptance-e2e', 'auth-app-api', 'user-app-api'],
  web: [
    'acceptance-e2e',
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'fullstack-e2e',
    'landing-app',
    'notification-consumer',
    'notification-scheduler',
    'site-app',
    'user-app',
    'user-app-api',
  ],
  fullstack: [
    'acceptance-e2e',
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'fullstack-e2e',
    'landing-app',
    'mobile-app',
    'notification-consumer',
    'notification-scheduler',
    'site-app',
    'user-app',
    'user-app-api',
  ],
  enterprise: [
    'acceptance-e2e',
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'discord-app-api',
    'fullstack-e2e',
    'landing-app',
    'mobile-app',
    'notification-consumer',
    'notification-scheduler',
    'site-app',
    'telegram-bot-api',
    'user-app',
    'user-app-api',
  ],
  bots: ['acceptance-e2e', 'auth-app-api', 'discord-app-api', 'telegram-bot-api', 'user-app', 'user-app-api'],
};

const referenceApplications = [
  'acceptance-e2e',
  'admin-app',
  'admin-app-api',
  'auth-app-api',
  'fullstack-e2e',
  'landing-app',
  'mobile-app',
  'site-app',
  'user-app',
  'user-app-api',
];
const optionalApplications = ['discord-app-api', 'notification-consumer', 'notification-scheduler', 'telegram-bot-api'];
const nonDeployableApplications = new Set([
  'acceptance-e2e',
  'fullstack-e2e',
  'notification-consumer',
  'notification-scheduler',
]);

function findApplicationProjects(directory) {
  const projects = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      projects.push(...findApplicationProjects(path));
    } else if (entry.name === 'project.json') {
      const project = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(typeof project.name, 'string', `${path} must declare an Nx project name.`);
      projects.push(project.name);
    }
  }
  return projects;
}

const actualApplications = findApplicationProjects(resolve(workspaceRoot, 'apps')).sort();
const selectionCatalog = runJson(['setup', '--list', '--json']);
const catalogApplications = selectionCatalog.applications ?? [];
assert.deepEqual(
  catalogApplications.map((entry) => entry.id).sort(),
  actualApplications,
  'The setup catalog must contain every real Nx application and no phantom projects.',
);
for (const entry of catalogApplications) {
  if (nonDeployableApplications.has(entry.id)) {
    assert.equal(entry.hostname, null, `Non-deployable application ${entry.id} must not publish a hostname.`);
    continue;
  }

  const expectedHostname = entry.id === 'landing-app' ? 'example.com' : `${entry.id}.example.com`;
  assert.equal(entry.hostname, expectedHostname, `Deployable application ${entry.id} has the wrong public hostname.`);
}
assert.deepEqual(
  catalogApplications
    .filter((entry) => entry.classification === 'reference')
    .map((entry) => entry.id)
    .sort(),
  referenceApplications,
  'The reference application classification changed unexpectedly.',
);
assert.deepEqual(
  catalogApplications
    .filter((entry) => entry.classification === 'optional')
    .map((entry) => entry.id)
    .sort(),
  optionalApplications,
  'Only integration APIs and notification workers may be optional in the template catalog.',
);
assert.deepEqual(
  [...presetExpectations.enterprise].sort(),
  actualApplications,
  'The enterprise profile must contain every real Nx application and no phantom projects.',
);
assert.deepEqual(
  [...presetExpectations.fullstack].sort(),
  [...referenceApplications, 'notification-consumer', 'notification-scheduler'].sort(),
  'The fullstack profile must contain every reference application and its required notification workers.',
);

const adminSelection = runJson([
  'setup',
  '--replace',
  '--app',
  'admin-app',
  '--non-interactive',
  '--dry-run',
  '--json',
]);
assert.deepEqual(
  adminSelection.summary?.apps,
  ['admin-app', 'admin-app-api', 'auth-app-api', 'notification-consumer', 'notification-scheduler'],
  'Selecting admin-app must include its APIs and notification workers.',
);

const e2eSelection = runJson([
  'setup',
  '--replace',
  '--app',
  'fullstack-e2e',
  '--non-interactive',
  '--dry-run',
  '--json',
]);
assert.deepEqual(
  e2eSelection.summary?.apps,
  [
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'fullstack-e2e',
    'landing-app',
    'notification-consumer',
    'notification-scheduler',
    'site-app',
    'user-app',
    'user-app-api',
  ],
  'Selecting fullstack-e2e must include the complete stack that its runtime starts.',
);

const verifiedPresets = [];
for (const [preset, expectedApps] of Object.entries(presetExpectations)) {
  const plan = runJson(['setup', '--preset', preset, '--non-interactive', '--dry-run', '--json']);
  assert.equal(plan.config?.preset, preset);
  assert.deepEqual(plan.summary?.apps, expectedApps, `Unexpected application closure for ${preset}.`);
  assert.ok(plan.summary?.capabilities?.length > 0, `${preset} must resolve capabilities.`);
  assert.ok(
    plan.operations?.some((operation) => operation.path === '.nrb/workspace.json'),
    `${preset} must generate the runtime selection manifest.`,
  );
  verifiedPresets.push({
    preset,
    applications: plan.summary.apps.length,
    capabilities: plan.summary.capabilities.length,
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'ok',
      node: doctor.checks.find((entry) => entry.name === 'runtime-version')?.message,
      pnpm: doctor.checks.find((entry) => entry.name === 'pnpm')?.message,
      catalog: {
        referenceApplications: referenceApplications.length,
        optionalApplications: optionalApplications.length,
      },
      presets: verifiedPresets,
    },
    null,
    2,
  )}\n`,
);
