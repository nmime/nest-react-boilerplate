import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildSelectedClosure, createLiveProjectGraph } from './closure.js';
import { renderClosureWorkspace } from './closure-materializer.js';
import { buildAllReferenceClosure } from './closure-workspace.js';

const configHash = 'e'.repeat(64);
const postgresInstrumentation = '@opentelemetry/instrumentation-pg';
const mongodbInstrumentation = '@opentelemetry/instrumentation-mongodb';

describe('selected OTel closure lock and install isolation', () => {
  it(
    'installs provider-free, PostgreSQL, and MongoDB closures without the opposite database instrumentation',
    { timeout: 120_000 },
    async () => {
      const graph = await createLiveProjectGraph();
      const cases = [
        {
          name: 'provider-free',
          closure: buildSelectedClosure(graph, {
            apps: ['landing-app'],
            capabilities: ['otel'],
            configHash,
          }),
          present: [] as string[],
          absent: [postgresInstrumentation, mongodbInstrumentation],
        },
        {
          name: 'postgres',
          closure: await buildAllReferenceClosure('postgres', graph),
          present: [postgresInstrumentation],
          absent: [mongodbInstrumentation],
        },
        {
          name: 'mongodb',
          closure: await buildAllReferenceClosure('mongodb', graph),
          present: [mongodbInstrumentation],
          absent: [postgresInstrumentation],
        },
      ];
      const workspaceRoot = new URL('../../../../', import.meta.url);
      const rootPackage = JSON.parse(readFileSync(new URL('package.json', workspaceRoot), 'utf8')) as {
        engines?: Record<string, string>;
        packageManager?: string;
      };
      const rootWorkspace = readFileSync(new URL('pnpm-workspace.yaml', workspaceRoot), 'utf8');

      for (const testCase of cases) {
        const root = mkdtempSync(join(tmpdir(), `nrb-otel-${testCase.name}-`));
        try {
          writeFileSync(
            join(root, 'package.json'),
            `${JSON.stringify(
              {
                name: `@nrb/otel-${testCase.name}`,
                private: true,
                packageManager: rootPackage.packageManager,
                engines: rootPackage.engines,
                dependencies: telemetryPackages(testCase.closure.productExternalPackages ?? {}),
              },
              null,
              2,
            )}\n`,
          );
          writeFileSync(join(root, 'pnpm-workspace.yaml'), renderClosureWorkspace(rootWorkspace));

          runPnpm(root, ['install', '--lockfile-only', '--offline', '--ignore-scripts']);
          const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
          for (const packageName of testCase.present) {
            assert.match(lock, new RegExp(escapeRegExp(packageName), 'u'));
          }
          for (const packageName of testCase.absent) {
            assert.doesNotMatch(lock, new RegExp(escapeRegExp(packageName), 'u'));
          }
          assert.doesNotMatch(lock, /@opentelemetry\/auto-instrumentations-node/u);

          runPnpm(root, ['install', '--prod', '--frozen-lockfile', '--offline', '--ignore-scripts']);
          for (const packageName of testCase.present) {
            assert.equal(installed(root, packageName), true, packageName);
          }
          for (const packageName of testCase.absent) {
            assert.equal(installed(root, packageName), false, packageName);
          }
          assert.equal(installed(root, '@opentelemetry/auto-instrumentations-node'), false);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    },
  );
});

function runPnpm(cwd: string, args: string[]): void {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- the integration test exercises the repository-required pnpm executable.
  const result = spawnSync('pnpm', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function installed(root: string, packageName: string): boolean {
  return existsSync(join(root, 'node_modules', ...packageName.split('/')));
}

function telemetryPackages(packages: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(packages).filter(
      ([packageName]) => packageName === '@fastify/otel' || packageName.startsWith('@opentelemetry/'),
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
