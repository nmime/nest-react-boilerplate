#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadDotEnv } from './env-loader.ts';
import { resolveDatabaseMigrationProvider } from './migration-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';

interface ClientPlan {
  mode: string;
  image?: string;
  selected: { redactedCommand: string[] };
  reason?: string;
  warning?: string;
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, output: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') continue;
    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === '--dry-run') args.dryRun = true;
    else if (item === '--output') args.output = value();
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

export async function runBackupCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: repo-tooling db backup [--dry-run] [--output backups/app.dump]');
    return;
  }

  loadDotEnv();
  const provider = await resolveDatabaseMigrationProvider();
  const implementation = await loadProviderCommandModule(provider, 'backup');
  const output = args.output ||
    join(
      'backups',
      `${provider}-${new Date().toISOString().replace(/[:.]/gu, '-')}.${provider === 'mongodb' ? 'archive.gz' : 'dump'}`,
    );

  let connectionString: string;
  let selectedDatabase: string | undefined;
  let database: string;
  let plan: ClientPlan;
  if (provider === 'postgres') {
    connectionString = (implementation.postgresConnectionString as () => string)();
    database = (implementation.redactedPostgresConnectionString as (value: string) => string)(connectionString);
    plan = (
      implementation.createPostgresClientInvocation as (input: {
        connectionString: string;
        operation: 'backup';
        outputPath: string;
      }) => ClientPlan
    )({
      connectionString,
      operation: 'backup',
      outputPath: output,
    });
  } else {
    const environment = (
      implementation.createMongoArchiveEnvironment as () => { database?: string; uri: string }
    )();
    connectionString = environment.uri;
    selectedDatabase = environment.database;
    database = (implementation.redactMongoConnectionString as (value: string) => string)(connectionString);
    plan = (
      implementation.createMongoClientInvocation as (input: {
        connectionString: string;
        database?: string;
        operation: 'backup';
        archivePath: string;
      }) => ClientPlan
    )({
      connectionString,
      database: selectedDatabase,
      operation: 'backup',
      archivePath: output,
    });
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          status: 'dry-run',
          ...(provider === 'mongodb' ? { provider } : {}),
          database,
          output,
          mode: plan.mode,
          clientImage: plan.mode === 'docker' ? plan.image : undefined,
          command: plan.selected.redactedCommand,
          reason: plan.reason,
          warning: plan.warning,
        },
        null,
        2,
      ),
    );
    return;
  }

  mkdirSync(output.includes('/') ? output.slice(0, output.lastIndexOf('/')) : '.', { recursive: true });
  const status = provider === 'postgres'
    ? (
        implementation.runPostgresClient as (input: {
          connectionString: string;
          operation: 'backup';
          outputPath: string;
        }) => number
      )({ connectionString, operation: 'backup', outputPath: output })
    : (
        implementation.runMongoClient as (input: {
          connectionString: string;
          database?: string;
          operation: 'backup';
          archivePath: string;
        }) => number
      )({
        connectionString,
        database: selectedDatabase,
        operation: 'backup',
        archivePath: output,
      });
  if (status !== 0) throw new Error(`${provider} backup client exited with ${status}.`);
  console.log(JSON.stringify({ status: 'backed-up', ...(provider === 'mongodb' ? { provider } : {}), database, output }));
}

const invokedDirectly = process.argv[1]?.endsWith('backup.ts') || process.argv[1]?.endsWith('backup.js');
if (invokedDirectly) {
  runBackupCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
