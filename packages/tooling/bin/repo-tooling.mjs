#!/usr/bin/env node
import { createJiti } from 'jiti';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const jiti = createJiti(import.meta.url, {
  alias: {
    '@app/common-i18n-runtime': resolve(workspaceRoot, 'libs/common/i18n/runtime/lib/src/index.ts'),
  },
});
const { main } = await jiti.import('../src/cli.ts');

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
