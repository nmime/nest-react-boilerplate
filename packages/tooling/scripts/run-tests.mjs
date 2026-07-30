#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const testRoot = resolve(workspaceRoot, 'packages/tooling/src');
const inProcessTest = 'packages/tooling/src/commands/project/setup.test.ts';
/**
 * Resource-heavy suites are matched by naming convention rather than listed, so a new
 * container-backed test is partitioned automatically. Naming one file explicitly left
 * `mongo-migrate.component.test.ts` inside the parallel burst, where its replica set competed
 * with ~65 unit files for the Docker daemon and timed out.
 */
const serialTestPattern = /\.(?:integration|component)\.test\.ts$/u;
const skipIntegration = process.env.SKIP_INTEGRATION === '1';
const testConcurrency = process.env.NODE_TEST_CONCURRENCY ?? '2';
if (!/^[1-9]\d*$/.test(testConcurrency)) {
  throw new Error(`NODE_TEST_CONCURRENCY must be a positive integer, received: ${testConcurrency}`);
}
const jitiAlias = {
  ...JSON.parse(process.env.JITI_ALIAS || '{}'),
  '@app/common-i18n-runtime': resolve(workspaceRoot, 'libs/common/i18n/runtime/lib/src/index.ts'),
};

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
    env: { ...process.env, JITI_ALIAS: JSON.stringify(jitiAlias) },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tests = collectTests(testRoot);
const serialTests = tests.filter((path) => path !== inProcessTest && serialTestPattern.test(path));
const isolatedTests = tests.filter((path) => path !== inProcessTest && !serialTestPattern.test(path));
if (isolatedTests.length === 0 || serialTests.length === 0 || !tests.includes(inProcessTest)) {
  throw new Error('Tooling test partition is incomplete.');
}

// Keep the container-backed files out of the parallel unit-test burst. The
// setup CLI test exercises process output, which can corrupt Node 24's
// child-process test protocol, so only that file is run in-process.
run(['--test', `--test-concurrency=${testConcurrency}`, '--import', 'jiti/register', ...isolatedTests]);
if (!skipIntegration) {
  // One container-backed file at a time: they each start their own daemon-backed stack.
  for (const serialTest of serialTests) {
    run(['--test', '--test-concurrency=1', '--import', 'jiti/register', serialTest]);
  }
}
run([
  '--test',
  `--test-concurrency=${testConcurrency}`,
  '--test-isolation=none',
  '--import',
  'jiti/register',
  inProcessTest,
]);
