#!/usr/bin/env node
// @requirements REQ-SCAFFOLD-SAFETY-008
import { existsSync } from 'node:fs';

import { loadDotEnv } from './env-loader.ts';
import { resolveDatabaseMigrationProvider } from './migration-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';
import { assertRestoreSafety } from './restore-safety.ts';

interface ClientPlan {
  mode: string;
  image?: string;
  selected: { redactedCommand: string[] };
  reason?: string;
  warning?: string;
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, force: false, yes: false, input: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') continue;
    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === '--dry-run') args.dryRun = true;
    else if (item === '--force') args.force = true;
    else if (item === '--yes') args.yes = true;
    else if (item === '--input') args.input = value();
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

export async function runRestoreCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: repo-tooling db restore --input backups/app.dump --yes [--dry-run] [--force]');
    return;
  }
  if (!args.input) throw new Error('--input is required.');

  loadDotEnv();
  const provider = await resolveDatabaseMigrationProvider();
  const implementation = await loadProviderCommandModule(provider, 'restore');
  let connectionString: string;
  let selectedDatabase: string | undefined;
  let database: string;
  let plan: ClientPlan;
  if (provider === 'postgres') {
    connectionString = (implementation.postgresConnectionString as () => string)();
    const assertLocal = implementation.assertLocalPostgresDatabase as (value: string) => void;
    const isLocal = implementation.isLocalPostgresDatabase as (value: string, env: NodeJS.ProcessEnv) => boolean;
    assertRestoreSafety(args, connectionString, {
      assertLocalDevelopmentDatabase: assertLocal,
      isLocalDevelopmentDatabase: isLocal,
    });
    database = (implementation.redactedPostgresConnectionString as (value: string) => string)(connectionString);
    plan = (
      implementation.createPostgresClientInvocation as (input: {
        connectionString: string;
        operation: 'restore';
        outputPath: string;
      }) => ClientPlan
    )({
      connectionString,
      operation: 'restore',
      outputPath: args.input,
    });
  } else {
    const environment = (
      implementation.createMongoArchiveEnvironment as () => { database?: string; uri: string }
    )();
    connectionString = environment.uri;
    selectedDatabase = environment.database;
    const assertLocal = implementation.assertLocalMongoDatabase as (value: string) => void;
    const isLocal = implementation.isLocalMongoDatabase as (value: string, env: NodeJS.ProcessEnv) => boolean;
    assertRestoreSafety(args, connectionString, {
      assertLocalDevelopmentDatabase: assertLocal,
      isLocalDevelopmentDatabase: isLocal,
    });
    database = (implementation.redactMongoConnectionString as (value: string) => string)(connectionString);
    plan = (
      implementation.createMongoClientInvocation as (input: {
        connectionString: string;
        database?: string;
        operation: 'restore';
        archivePath: string;
      }) => ClientPlan
    )({
      connectionString,
      database: selectedDatabase,
      operation: 'restore',
      archivePath: args.input,
    });
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          status: 'dry-run',
          ...(provider === 'mongodb' ? { provider } : {}),
          database,
          input: args.input,
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

  if (!args.yes) throw new Error('Refusing restore without --yes.');
  if (!existsSync(args.input)) throw new Error(`Backup file not found: ${args.input}`);
  const status = provider === 'postgres'
    ? (
        implementation.runPostgresClient as (input: {
          connectionString: string;
          operation: 'restore';
          outputPath: string;
        }) => number
      )({
        connectionString,
        operation: 'restore',
        outputPath: args.input,
      })
    : (
        implementation.runMongoClient as (input: {
          connectionString: string;
          database?: string;
          operation: 'restore';
          archivePath: string;
        }) => number
      )({
        connectionString,
        database: selectedDatabase,
        operation: 'restore',
        archivePath: args.input,
      });
  if (status !== 0) throw new Error(`${provider} restore client exited with ${status}.`);
  console.log(
    JSON.stringify({ status: 'restored', ...(provider === 'mongodb' ? { provider } : {}), database, input: args.input }),
  );
}

const invokedDirectly = process.argv[1]?.endsWith('restore.ts') || process.argv[1]?.endsWith('restore.js');
if (invokedDirectly) {
  runRestoreCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
