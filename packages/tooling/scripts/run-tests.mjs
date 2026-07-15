#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const testRoot = resolve(workspaceRoot, 'packages/tooling/src');
const inProcessTest = 'packages/tooling/src/commands/project/setup.test.ts';
const integrationTest = 'packages/tooling/src/commands/db/migration.integration.test.ts';
const skipIntegration = process.env.SKIP_INTEGRATION === '1';

function collectTests(directory) {
  const tests = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...collectTests(path));
    } else if (entry.name.endsWith('.test.ts')) {
      tests.push(relative(workspaceRoot, path));
    }
  }
  return tests.sort();
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tests = collectTests(testRoot);
const isolatedTests = tests.filter((path) => path !== inProcessTest && path !== integrationTest);
if (isolatedTests.length === 0 || !tests.includes(inProcessTest) || !tests.includes(integrationTest)) {
  throw new Error('Tooling test partition is incomplete.');
}

// Keep the Docker integration file out of the parallel unit-test burst. The
// setup CLI test exercises process output, which can corrupt Node 24's
// child-process test protocol, so only that file is run in-process.
run(['--test', '--import', 'jiti/register', ...isolatedTests]);
if (!skipIntegration) {
  run(['--test', '--import', 'jiti/register', integrationTest]);
}
run(['--test', '--test-isolation=none', '--import', 'jiti/register', inProcessTest]);
