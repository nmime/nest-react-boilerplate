#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const jitiAlias = {
  ...JSON.parse(process.env.JITI_ALIAS || '{}'),
  '@app/common-i18n-runtime': resolve(workspaceRoot, 'libs/common/i18n/runtime/lib/src/index.ts'),
};
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-concurrency=1',
    '--import',
    'jiti/register',
    'packages/tooling/src/generators/application/generated.integration.ts',
  ],
  {
    cwd: workspaceRoot,
    env: { ...process.env, JITI_ALIAS: JSON.stringify(jitiAlias) },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
