import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

import type { DatabaseMigrationProvider } from './deployment-provider.ts';
import type { DatabaseProviderCommand } from './provider-command.ts';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-provider-sentinel-'));
const sentinelPath = join(temporaryRoot, 'sentinel.cjs');
writeFileSync(
  sentinelPath,
  `const Module = require('node:module');
const original = Module._resolveFilename;
const blocked = String(process.env.NRB_BLOCK_PACKAGES || '').split(',').filter(Boolean);
Module._resolveFilename = function(request, ...args) {
  if (blocked.some((name) => request === name || (name.endsWith('/') && request.startsWith(name)))) {
    throw new Error('Opposite-provider sentinel package resolved: ' + request);
  }
  return original.call(this, request, ...args);
};
`,
);

after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

const commands: DatabaseProviderCommand[] = ['migrate', 'reset', 'seed', 'backup', 'restore', 'restore-drill'];

describe('provider-only DB command module resolution', () => {
  for (const provider of ['postgres', 'mongodb'] as const) {
    for (const command of commands) {
      it(`${command} loads only the selected ${provider} dependency graph`, () => {
        assertProviderModuleLoads(provider, command);
      });
    }

    it(`deployment migrator loads only the selected ${provider} dependency graph`, () => {
      const script = `
        const migrator = await import(${JSON.stringify(resolve(workspaceRoot, 'docker/migrator-run.mjs'))});
        await migrator.loadMigratorImplementation(${JSON.stringify(provider)});
      `;
      assertSentinelProcess(provider, script);
    });
  }
});

function assertProviderModuleLoads(provider: DatabaseMigrationProvider, command: DatabaseProviderCommand): void {
  const dispatcherPath = resolve(workspaceRoot, 'packages/tooling/src/commands/db/provider-command.ts');
  const commandPath = resolve(workspaceRoot, `packages/tooling/src/commands/db/${command}.ts`);
  const commonI18nPath = resolve(workspaceRoot, 'libs/common/i18n/runtime/lib/src/index.ts');
  const script = `
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url, {
      alias: { '@app/common-i18n-runtime': ${JSON.stringify(commonI18nPath)} }
    });
    await jiti.import(${JSON.stringify(commandPath)});
    const dispatcher = await jiti.import(${JSON.stringify(dispatcherPath)});
    await dispatcher.loadProviderCommandModule(${JSON.stringify(provider)}, ${JSON.stringify(command)});
  `;
  assertSentinelProcess(provider, script);
}

function assertSentinelProcess(provider: DatabaseMigrationProvider, script: string): void {
  const blocked = provider === 'postgres' ? 'mongodb,mongodb-connection-string-url' : 'pg,@mikro-orm/';
  const result = spawnSync(
    process.execPath,
    ['--require', sentinelPath, '--input-type=module', '--eval', script],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, NRB_BLOCK_PACKAGES: blocked },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Opposite-provider sentinel package resolved/u);
}
