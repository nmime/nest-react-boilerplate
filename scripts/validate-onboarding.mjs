#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = process.cwd();
const toolingBin = resolve(workspaceRoot, 'packages/tooling/bin/repo-tooling.mjs');

function runJson(args) {
  const result = spawnSync(process.execPath, [toolingBin, ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, NX_DAEMON: 'false' },
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

const requiredDoctorChecks = ['node-version', 'pnpm', 'manifests', 'lock-file', 'nx-graph', 'tooling-package'];
for (const name of requiredDoctorChecks) {
  const check = doctor.checks?.find((entry) => entry.name === name);
  assert.equal(check?.status, 'pass', `Doctor check must pass: ${name}`);
}

const presetExpectations = {
  minimal: ['auth-app-api', 'user-app-api'],
  starter: ['auth-app-api', 'user-app', 'user-app-api'],
  fullstack: ['admin-app', 'admin-app-api', 'auth-app-api', 'fullstack-e2e', 'landing-app', 'user-app', 'user-app-api'],
  enterprise: [
    'admin-app',
    'admin-app-api',
    'auth-app-api',
    'discord-app-api',
    'fullstack-e2e',
    'landing-app',
    'mobile-app',
    'site-app',
    'telegram-bot-api',
    'telegram-bot-worker',
    'user-app',
    'user-app-api',
  ],
  bots: ['auth-app-api', 'discord-app-api', 'telegram-bot-api', 'telegram-bot-worker', 'user-app-api'],
};

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
      node: doctor.checks.find((entry) => entry.name === 'node-version')?.message,
      pnpm: doctor.checks.find((entry) => entry.name === 'pnpm')?.message,
      presets: verifiedPresets,
    },
    null,
    2,
  )}\n`,
);
