#!/usr/bin/env node
/**
 * native-datastores — install and configure PostgreSQL and Redis directly on this
 * host, for a fully native (no-Docker) deployment.
 *
 *   sudo node scripts/native-datastores.mjs install
 *   sudo node scripts/native-datastores.mjs configure --secrets-env=.env.pm2-secrets
 *
 * Design: plan builders are pure so every generated SQL statement and systemd
 * action is unit-tested without touching a host. Both services bind to 127.0.0.1
 * only; passwords come from the generated secrets file and are re-applied (never
 * reset to a new value) on each run. Nothing here ever drops a role, database, or
 * table.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const defaultRole = 'nest_react_boilerplate';
const postgresPort = 5432;
const redisPort = 6379;

const step = (title, command, args, extra = {}) => ({ title, command, args, ...extra });

/** Escape a value for use as a single-quoted SQL literal. */
export function quoteSqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Validate a PostgreSQL identifier (role/database name) without quoting tricks. */
function assertIdentifier(value, label) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(String(value))) {
    throw new Error(`${label} must be a lowercase PostgreSQL identifier (received "${value}").`);
  }
  return value;
}

export function buildPostgresUrl({ role, password, database, host = '127.0.0.1', port = postgresPort }) {
  return `postgres://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function buildRedisUrl({ password, host = '127.0.0.1', port = redisPort }) {
  return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
}

/** Install the packages and make both services loopback-only. Pure. */
export function buildInstallPlan() {
  return [
    step('Refresh package metadata', 'apt-get', ['update']),
    step('Install PostgreSQL', 'apt-get', [
      'install',
      '-y',
      '--no-install-recommends',
      'postgresql',
      'postgresql-client',
    ]),
    step('Install Redis', 'apt-get', ['install', '-y', '--no-install-recommends', 'redis-server']),
    // Data services must never be reachable from outside this host; the app talks
    // to them over loopback and nginx is the only public listener.
    step('Restrict PostgreSQL to loopback', 'sh', [
      '-c',
      "install -d -m 0755 /etc/postgresql-common/createcluster.d && printf 'listen_addresses = %s\\n' \"'localhost'\" > /etc/postgresql-common/createcluster.d/10-nrb-loopback.conf",
    ]),
    step('Restrict Redis to loopback', 'sh', [
      '-c',
      "printf 'bind 127.0.0.1 -::1\\nprotected-mode yes\\n' > /etc/redis/redis.conf.d/10-nrb-loopback.conf 2>/dev/null || printf 'bind 127.0.0.1 -::1\\nprotected-mode yes\\n' >> /etc/redis/redis.conf",
    ]),
    step('Enable PostgreSQL', 'systemctl', ['enable', '--now', 'postgresql']),
    step('Enable Redis', 'systemctl', ['enable', '--now', 'redis-server']),
  ];
}

/**
 * Create the application role/database if absent and apply the generated
 * passwords. Idempotent and non-destructive. Pure.
 */
export function buildConfigurePlan({ role, database, password, redisPassword }) {
  assertIdentifier(role, 'POSTGRES_USER');
  assertIdentifier(database, 'POSTGRES_DB');
  if (role === 'postgres') {
    throw new Error('POSTGRES_USER must be a dedicated non-superuser role, not the postgres superuser.');
  }
  if (!password) throw new Error('A generated POSTGRES_PASSWORD is required; run the secret scaffolder first.');
  if (!redisPassword) throw new Error('A generated REDIS_PASSWORD is required; run the secret scaffolder first.');

  const literal = quoteSqlLiteral(password);
  // NOTE: no DROP anywhere — an existing role/database is reused as-is and only
  // its password is re-applied, so re-running never destroys data.
  //
  // Every statement carrying a password is delivered on stdin (`psql -f -`, `tee`)
  // instead of in argv: /proc/<pid>/cmdline is world-readable, so a password passed
  // as an argument is visible to every local user for the life of the process.
  const createRole = [
    `DO $nrb$ BEGIN`,
    `IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteSqlLiteral(role)}) THEN`,
    `CREATE ROLE ${role} LOGIN PASSWORD ${literal};`,
    `END IF; END $nrb$;`,
  ].join(' ');
  const setPassword = `ALTER ROLE ${role} WITH LOGIN PASSWORD ${literal};`;

  return [
    step('Create the application role if absent', 'su', ['-', 'postgres', '-c', 'psql -v ON_ERROR_STOP=1 -f -'], {
      input: `${createRole}\n`,
    }),
    step('Apply the generated database password', 'su', ['-', 'postgres', '-c', 'psql -v ON_ERROR_STOP=1 -f -'], {
      input: `${setPassword}\n`,
    }),
    step('Create the application database if absent', 'su', [
      '-',
      'postgres',
      '-c',
      `psql -tAc ${JSON.stringify(`SELECT 1 FROM pg_database WHERE datname = ${quoteSqlLiteral(database)}`)} | grep -q 1 || createdb -O ${role} ${database}`,
    ]),
    step(
      'Apply the generated Redis password',
      'sh',
      [
        '-c',
        'install -d -m 0750 -o redis -g redis /etc/redis/redis.conf.d 2>/dev/null || true; ' +
          'umask 027 && cat > /etc/redis/redis.conf.d/20-nrb-auth.conf && ' +
          "grep -q '^include /etc/redis/redis.conf.d/' /etc/redis/redis.conf || " +
          "printf 'include /etc/redis/redis.conf.d/*.conf\\n' >> /etc/redis/redis.conf; " +
          'chown redis:redis /etc/redis/redis.conf.d/20-nrb-auth.conf 2>/dev/null || true; ' +
          'chmod 640 /etc/redis/redis.conf.d/20-nrb-auth.conf; systemctl reload-or-restart redis-server',
      ],
      { input: `requirepass ${redisPassword}\n` },
    ),
  ];
}

/** Read `KEY=value` pairs from the emitted secrets file. Pure. */
export function parseSecretsEnv(content) {
  const result = {};
  for (const line of String(content).split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    result[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return result;
}

function readEnvValue(path, key, fallback) {
  if (!existsSync(path)) return fallback;
  return parseSecretsEnv(readFileSync(path, 'utf8'))[key] || fallback;
}

function run(plan, { dryRun }) {
  for (const [index, item] of plan.entries()) {
    console.log(`\n==> [${index + 1}/${plan.length}] ${item.title}`);
    if (dryRun) {
      // Never echo an item's stdin: that is where the generated passwords travel.
      console.log(`    ${item.command} ${item.args.join(' ')}${item.input ? ' <<(secret on stdin)' : ''}`);
      continue;
    }
    const result = spawnSync(item.command, item.args, {
      cwd: repoRoot,
      ...(item.input === undefined
        ? { stdio: 'inherit' }
        : { input: item.input, stdio: ['pipe', 'inherit', 'inherit'] }),
    });
    if (result.error?.code === 'ENOENT') {
      console.error(`\n"${item.command}" is not available on this host.`);
      process.exit(127);
    }
    if (result.status !== 0) {
      console.error(`\nStep failed: ${item.title} (exit ${result.status}).`);
      process.exit(result.status ?? 1);
    }
  }
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  const options = { dryRun: false, secretsEnv: '.env.pm2-secrets', productionEnv: '.env.production' };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--secrets-env=')) options.secretsEnv = arg.slice('--secrets-env='.length);
    else if (arg.startsWith('--production-env=')) options.productionEnv = arg.slice('--production-env='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['install', 'configure'].includes(action)) {
    console.log(
      'Usage: native-datastores.mjs <install|configure> [--secrets-env=path] [--production-env=path] [--dry-run]',
    );
    process.exit(action ? 2 : 0);
  }
  if (action === 'install') {
    run(buildInstallPlan(), options);
    console.log('\nPostgreSQL and Redis are installed and bound to 127.0.0.1.');
    return;
  }
  const secretsPath = resolve(repoRoot, options.secretsEnv);
  const productionPath = resolve(repoRoot, options.productionEnv);
  const secrets = existsSync(secretsPath) ? parseSecretsEnv(readFileSync(secretsPath, 'utf8')) : {};
  const role = readEnvValue(productionPath, 'POSTGRES_USER', defaultRole);
  const database = readEnvValue(productionPath, 'POSTGRES_DB', defaultRole);
  run(
    buildConfigurePlan({
      role,
      database,
      password: secrets.POSTGRES_PASSWORD,
      redisPassword: secrets.REDIS_PASSWORD,
    }),
    options,
  );
  console.log(`\nConfigured. Export these before starting the app:`);
  console.log(`  DATABASE_URL=${buildPostgresUrl({ role, password: '<POSTGRES_PASSWORD>', database })}`);
  console.log(`  REDIS_URL=${buildRedisUrl({ password: '<REDIS_PASSWORD>' })}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`native-datastores failed: ${error.message}`);
    process.exit(1);
  }
}
