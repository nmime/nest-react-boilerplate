#!/usr/bin/env node
import { defaultLocale } from '@app/common-i18n-runtime';

import { loadDotEnv } from './env-loader.ts';
import { resolveDatabaseMigrationProvider } from './migration-provider.ts';
import { loadProviderCommandModule } from './provider-command.ts';
import { buildSeedUsers, permissions, roles, type SeedUser } from './seed-data.ts';
import { assertSeedSafety, DefaultAdminEmail, DefaultAdminPassword, resolvePassword } from './seed-safety.ts';

interface SeedArgs {
  dryRun: boolean;
  force: boolean;
  email: string;
  password: string;
  passwordEnv: string;
  displayName: string;
  help: boolean;
}

function parseArgs(argv: string[]): SeedArgs {
  const args: SeedArgs = {
    dryRun: false,
    force: false,
    email: DefaultAdminEmail,
    password: DefaultAdminPassword,
    passwordEnv: '',
    displayName: 'Local Admin',
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
    if (item === '--dry-run') args.dryRun = true;
    else if (item === '--force') args.force = true;
    else if (item === '--email') args.email = value();
    else if (item === '--password') args.password = value();
    else if (item === '--password-env') args.passwordEnv = value();
    else if (item === '--display-name') args.displayName = value();
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

export async function runSeedCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'Usage: pnpm db:seed [--dry-run] [--force] [--email EMAIL] [--password PASSWORD | --password-env VAR] [--display-name NAME]',
    );
    return;
  }

  loadDotEnv();
  args.password = resolvePassword(args) ?? args.password;
  const provider = await resolveDatabaseMigrationProvider();
  const implementation = await loadProviderCommandModule(provider, 'seed');
  const seedUsers = buildSeedUsers(args.password, defaultLocale);

  let connectionString: string;
  let database: string;
  if (provider === 'postgres') {
    const postgresConnectionString = implementation.postgresConnectionString as () => string;
    const redact = implementation.redactedPostgresConnectionString as (value: string) => string;
    const assertLocal = implementation.assertLocalPostgresDatabase as (value: string) => void;
    const isLocal = implementation.isLocalPostgresDatabase as (value: string, env: NodeJS.ProcessEnv) => boolean;
    connectionString = postgresConnectionString();
    assertSeedSafety(args, connectionString, {
      assertLocalDevelopmentDatabase: assertLocal,
      isLocalDevelopmentDatabase: isLocal,
    });
    database = redact(connectionString);
  } else {
    const createEnvironment = implementation.createMongoOperationEnvironment as () => {
      database: string;
      uri: string;
    };
    const redact = implementation.redactMongoConnectionString as (value: string) => string;
    const assertLocal = implementation.assertLocalMongoDatabase as (value: string) => void;
    const isLocal = implementation.isLocalMongoDatabase as (value: string, env: NodeJS.ProcessEnv) => boolean;
    const environment = createEnvironment();
    connectionString = environment.uri;
    assertSeedSafety(args, connectionString, {
      assertLocalDevelopmentDatabase: assertLocal,
      isLocalDevelopmentDatabase: isLocal,
    });
    database = redact(connectionString);
  }

  const plan = {
    ...(provider === 'mongodb' ? { provider } : {}),
    database,
    permissions: permissions.map((permission) => permission.key),
    roles: roles.map((role) => role.key),
    users: seedUsers.map((user) => ({ email: user.email, role: user.role })),
  };
  if (args.dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
    return;
  }

  const inserted = provider === 'postgres'
    ? await (
        implementation.seedPostgresDatabase as (
          connectionString: string,
          users: SeedUser[],
        ) => Promise<Record<string, number>>
      )(connectionString, seedUsers)
    : (
        await (
          implementation.seedMongoDatabase as (
            users: SeedUser[],
          ) => Promise<{ inserted: Record<string, number> }>
        )(seedUsers)
      ).inserted;
  console.log(
    JSON.stringify(
      {
        status: 'seeded',
        ...(provider === 'mongodb' ? { provider } : {}),
        database,
        inserted,
        users: seedUsers.map((user) => ({
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          password: '[hashed]',
        })),
      },
      null,
      2,
    ),
  );
}

const invokedDirectly = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (invokedDirectly) {
  runSeedCommand().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
