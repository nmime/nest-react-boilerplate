#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');

const behaviorTests = [
  'packages/tooling/src/commands/project/add.test.ts',
  'packages/tooling/src/commands/project/agent-scaffold-contract.test.ts',
  'packages/tooling/src/generators/names.unit.test.ts',
  'packages/tooling/src/generators/application/generator.unit.test.ts',
  'packages/tooling/src/generators/library/generator.unit.test.ts',
  'packages/tooling/src/generators/feature/generator.unit.test.ts',
];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['--test', '--import', 'jiti/register', ...behaviorTests]);
run([
  '--test',
  '--test-isolation=none',
  '--import',
  'jiti/register',
  'packages/tooling/src/commands/project/setup.test.ts',
]);
