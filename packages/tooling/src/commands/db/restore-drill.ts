#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadDotEnv } from './env-loader.ts';
import { resolveDatabaseMigrationProvider } from './migration-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';

function parseArgs(argv: string[]) {
  const args = {
    ci: false,
    dryRun: false,
    force: false,
    yes: false,
    output: '',
    input: '',
    report: 'test-results/dr/restore-drill.json',
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') continue;
    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === '--ci') args.ci = true;
    else if (item === '--dry-run') args.dryRun = true;
    else if (item === '--force') args.force = true;
    else if (item === '--yes') args.yes = true;
    else if (item === '--output') args.output = value();
    else if (item === '--input') args.input = value();
    else if (item === '--report') args.report = value();
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

function runStep(label: string, command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  return {
    label,
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export async function runRestoreDrillCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'Usage: repo-tooling db restore-drill [--ci] [--dry-run] [--output provider-backup] [--input existing-backup] [--yes] [--force] [--report path]',
    );
    return;
  }

  loadDotEnv();
  const provider = await resolveDatabaseMigrationProvider();
  const implementation = await loadProviderCommandModule(provider, 'restore-drill');
  const connectionString = provider === 'postgres'
    ? (implementation.postgresConnectionString as () => string)()
    : (implementation.createMongoArchiveEnvironment as () => { uri: string })().uri;
  const database = provider === 'postgres'
    ? (implementation.redactedPostgresConnectionString as (value: string) => string)(connectionString)
    : (implementation.redactMongoConnectionString as (value: string) => string)(connectionString);
  const output = args.output ||
    join(
      'test-results',
      'dr',
      provider === 'mongodb' ? 'mongodb-restore-drill.archive.gz' : 'postgres-restore-drill.dump',
    );
  const input = args.input || output;
  const dryRun = args.dryRun || args.ci;
  const steps = [];
  if (dryRun) {
    steps.push(
      runStep('backup-dry-run', process.execPath, [
        'packages/tooling/bin/repo-tooling.mjs',
        'db',
        'backup',
        '--dry-run',
        '--output',
        output,
      ]),
    );
    steps.push(
      runStep('restore-dry-run', process.execPath, [
        'packages/tooling/bin/repo-tooling.mjs',
        'db',
        'restore',
        '--dry-run',
        '--input',
        input,
        ...(args.force || args.ci ? ['--force'] : []),
      ]),
    );
  } else {
    steps.push(
      runStep('backup', process.execPath, [
        'packages/tooling/bin/repo-tooling.mjs',
        'db',
        'backup',
        '--output',
        output,
      ]),
    );
    if ((steps.at(-1)?.status ?? 1) === 0) {
      steps.push(
        runStep('restore', process.execPath, [
          'packages/tooling/bin/repo-tooling.mjs',
          'db',
          'restore',
          '--input',
          input,
          '--yes',
          ...(args.force ? ['--force'] : []),
        ]),
      );
    }
  }

  const ok = steps.every((step) => step.status === 0);
  const report = {
    status: ok ? 'ok' : 'failed',
    mode: dryRun ? 'ci-safe-dry-run' : 'destructive-local-drill',
    ...(provider === 'mongodb' ? { provider } : {}),
    database,
    output,
    input,
    rpoTargetMinutes: 60,
    rtoTargetMinutes: 60,
    steps,
  };
  mkdirSync(dirname(args.report), { recursive: true });
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!ok) throw new Error('Restore drill failed.');
}

const invokedDirectly = process.argv[1]?.endsWith('restore-drill.ts') || process.argv[1]?.endsWith('restore-drill.js');
if (invokedDirectly) {
  runRestoreDrillCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
