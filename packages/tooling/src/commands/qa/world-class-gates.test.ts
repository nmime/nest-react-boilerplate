// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, describe, it } from 'node:test';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-world-class-'));
const commandEnvironmentNames = [
  'QA_CONCURRENCY_COMMAND',
  'CONCURRENCY_TEST_COMMAND',
  'QA_OBSERVABILITY_COMMAND',
  'OBSERVABILITY_COMMAND',
  'QA_USER_JOURNEY_COMMAND',
  'USER_JOURNEY_COMMAND',
] as const;

after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

function runGate(gate: string, commandEnv?: string, timeoutMs = '2000') {
  const report = join(temporaryRoot, `${gate}-${Math.random().toString(16).slice(2)}.json`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'false',
    WORLD_CLASS_COMMAND_TIMEOUT_MS: timeoutMs,
  };
  for (const name of commandEnvironmentNames) delete env[name];
  if (commandEnv) env[commandEnv] = JSON.stringify([process.execPath, '-e', 'process.exit(0)']);
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'jiti/register',
      'packages/tooling/src/commands/qa/world-class-gates.ts',
      '--gate',
      gate,
      '--report',
      report,
    ],
    { cwd: process.cwd(), encoding: 'utf8', env, timeout: 10_000 },
  );
  const parsed = JSON.parse(readFileSync(report, 'utf8')) as {
    gates: unknown[];
    notSelected: unknown[];
    skipped: unknown[];
    status: string;
  };
  return { parsed, result };
}

describe('world-class authoritative gate execution', () => {
  for (const [gate, commandEnv] of [
    ['real-user-journey-e2e', 'QA_USER_JOURNEY_COMMAND'],
    ['observability', 'QA_OBSERVABILITY_COMMAND'],
    ['concurrency-race', 'QA_CONCURRENCY_COMMAND'],
  ] as const) {
    it(`${gate} fails without an authoritative command`, () => {
      const { parsed, result } = runGate(gate);
      assert.equal(result.status, 1, result.stderr);
      assert.equal(parsed.status, 'failed');
    });

    it(`${gate} accepts an executed argv command`, () => {
      const { parsed, result } = runGate(gate, commandEnv);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(parsed.status, 'ok');
      assert.equal(parsed.gates.length, 1);
      assert.equal(parsed.notSelected.length, 11);
      assert.deepEqual(parsed.skipped, []);
    });
  }

  it('fails and records a command timeout', () => {
    const report = join(temporaryRoot, 'timeout.json');
    const env = {
      ...process.env,
      CI: 'false',
      QA_OBSERVABILITY_COMMAND: JSON.stringify([
        process.execPath,
        '-e',
        'setTimeout(() => undefined, 10_000)',
      ]),
      WORLD_CLASS_COMMAND_TIMEOUT_MS: '100',
    };
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'jiti/register',
        'packages/tooling/src/commands/qa/world-class-gates.ts',
        '--gate',
        'observability',
        '--report',
        report,
      ],
      { cwd: process.cwd(), encoding: 'utf8', env, timeout: 10_000 },
    );
    const parsed = JSON.parse(readFileSync(report, 'utf8')) as { status: string };
    assert.equal(result.status, 1, result.stderr);
    assert.equal(parsed.status, 'failed');
  });
});
