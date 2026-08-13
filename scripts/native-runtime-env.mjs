#!/usr/bin/env node
/**
 * native-runtime-env — turn the protected `.env.production` of a native host into
 * the environment its processes actually read, then exec a command with it.
 *
 *   node scripts/native-runtime-env.mjs exec --production-env=/etc/nrb/.env.production -- pm2 startOrReload ...
 *   node scripts/native-runtime-env.mjs keys --production-env=...      # names only, never values
 *
 * Containers get this for free from docker/secret-entrypoint.sh, which dereferences
 * every `*_FILE` path into a plain variable. PM2 has no such hook, so this module is
 * that hook — and it hands the values to the child through its environment, never
 * through argv (`/proc/<pid>/cmdline` is world-readable) and never through an
 * aggregated plaintext file on disk.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnvFile } from './compose-production.mjs';
import { parseDeclaredSecrets } from './declared-secrets.mjs';
import { buildPostgresUrl } from './native-datastores.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Keys the application dereferences itself, and which must therefore be passed
 * through as a path. Setting both the plain key and its `_FILE` sibling is a startup
 * error ("Configure only one of ..."), so resolving these would break every boot.
 */
export const applicationResolvedSecretFiles = new Set([
  'AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE',
  'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE',
]);

/**
 * `<KEY>_FILE` indirections that must be dereferenced into a plain variable, because the reading
 * code only ever looks at the plain name.
 *
 * Derived from the entrypoint's manifest rather than restated, because that manifest is the
 * workspace's one enumeration of application secrets and this is the container-free half of the
 * same job. The list used to be written out here and had drifted four secrets short — MongoDB's
 * URI and password, and the FCM and APNs signing keys — so a native deployment of a Mongo product
 * booted without its database credentials and a push send failed at first use rather than at
 * start-up. A secret added to the entrypoint now reaches both runtimes at once.
 *
 * Two manifest entries can alias onto one variable (the migration secrets do), which collapses to
 * a single `_FILE` key here.
 */
export const secretFileEnvironmentKeys = Object.fromEntries(
  [...new Set(parseDeclaredSecrets(readFileSync(resolve(repoRoot, 'docker/secret-entrypoint.sh'), 'utf8')).map(({ variable }) => variable))]
    .map((variable) => [`${variable}_FILE`, variable])
    .filter(([fileKey]) => !applicationResolvedSecretFiles.has(fileKey)),
);

const fail = (message) => {
  throw new Error(message);
};

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * A bare single-label host is a Compose service alias (`postgres`, `redis`,
 * `otel-collector`) and cannot resolve on a native host. Real external endpoints are
 * always an IP or a dotted name, so this catches the whole class without enumerating
 * service names.
 */
function assertReachableHost(host, key) {
  const bare = String(host).replace(/^\[|\]$/gu, '');
  if (loopbackHosts.has(bare) || loopbackHosts.has(host)) return;
  if (!bare.includes('.') && !bare.includes(':')) {
    fail(`${key} points at "${host}", which is a container service name and does not resolve on a native host.`);
  }
}

/** Single-value endpoints that must parse as a URL. */
const urlEndpointKeys = ['REDIS_URL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'DATABASE_URL'];
/** Comma-separated `host:port` (or URL) lists. */
const hostListEndpointKeys = ['REDIS_HOSTS', 'NATS_SERVERS'];

/** Validate that every configured endpoint is reachable without Compose DNS. Pure. */
export function assertNativeEndpoints(environment) {
  const postgresHost = environment.POSTGRES_HOST?.trim();
  if (postgresHost) assertReachableHost(postgresHost, 'POSTGRES_HOST');
  for (const key of urlEndpointKeys) {
    const value = environment[key]?.trim();
    if (!value) continue;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      fail(`${key} must be a valid URL for a native host (received "${value}").`);
    }
    assertReachableHost(parsed.hostname, key);
  }
  for (const key of hostListEndpointKeys) {
    for (const entry of (environment[key]?.trim() || '').split(',').filter(Boolean)) {
      // Entries may be `host:port` or a full URL, so drop any scheme before the host.
      const host = entry
        .trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
        .split('/')[0]
        .split(':')[0];
      assertReachableHost(host, key);
    }
  }
}

/**
 * Build the environment a native process tree needs. Pure: `readSecret` is injected
 * so every mapping is unit-tested without touching a protected file.
 *
 * `includeSecrets: false` is for build steps, which need the VITE_* surface but must
 * never have credentials in their process environment.
 */
export function resolveNativeEnvironment({ production, readSecret, includeSecrets = true }) {
  const environment = {};
  for (const [key, value] of Object.entries(production)) {
    // Resolved indirections are replaced by their plain sibling. The keys the app reads itself are
    // absent from the table by construction, so they fall through here and stay as paths.
    if (key in secretFileEnvironmentKeys) continue;
    environment[key] = value;
  }
  if (!includeSecrets) return environment;

  for (const [fileKey, plainKey] of Object.entries(secretFileEnvironmentKeys)) {
    const path = production[fileKey]?.trim();
    if (!path) continue;
    const value = readSecret(path)?.replace(/\r?\n$/u, '');
    // serverctl creates empty placeholders for secrets only an external system can
    // issue. An empty value must stay unset so the app's own required-key checks fire.
    if (!value) continue;
    environment[plainKey] = value;
  }

  // Better Auth requires DATABASE_URL even though MikroORM can work from POSTGRES_*,
  // and no native component composes it. Percent-encoding is load-bearing: generated
  // passwords are base64 and contain +, / and =.
  if (production.COMPOSE_DATABASE_MODE?.trim() === 'native' && !environment.DATABASE_URL) {
    const role = production.POSTGRES_USER?.trim();
    const database = production.POSTGRES_DB?.trim();
    if (!role || !database) fail('COMPOSE_DATABASE_MODE=native requires POSTGRES_USER and POSTGRES_DB.');
    if (!environment.POSTGRES_PASSWORD) fail('COMPOSE_DATABASE_MODE=native requires POSTGRES_PASSWORD_FILE material.');
    environment.DATABASE_URL = buildPostgresUrl({
      role,
      password: environment.POSTGRES_PASSWORD,
      database,
      host: production.POSTGRES_HOST?.trim() || '127.0.0.1',
      port: Number(production.POSTGRES_PORT?.trim() || 5432),
    });
  }
  return environment;
}

function parseOptions(argv) {
  const options = { productionEnv: '.env.production', includeSecrets: true, command: [] };
  const rest = [...argv];
  while (rest.length) {
    const argument = rest.shift();
    if (argument === '--') {
      options.command = rest.splice(0);
      break;
    }
    if (argument.startsWith('--production-env=')) options.productionEnv = argument.slice('--production-env='.length);
    else if (argument === '--no-secrets') options.includeSecrets = false;
    else fail(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  if (!['exec', 'keys'].includes(action)) {
    console.log('Usage: native-runtime-env.mjs <exec|keys> [--production-env=path] [--no-secrets] [-- command ...]');
    process.exit(action ? 2 : 0);
  }
  const options = parseOptions(rest);
  const productionPath = resolve(repoRoot, options.productionEnv);
  if (!existsSync(productionPath)) fail(`Production environment file not found: ${productionPath}`);
  const production = parseEnvFile(readFileSync(productionPath, 'utf8'));
  const environment = resolveNativeEnvironment({
    production,
    includeSecrets: options.includeSecrets,
    readSecret: (path) => {
      if (!existsSync(path)) fail(`Secret file not found: ${path}`);
      return readFileSync(path, 'utf8');
    },
  });
  assertNativeEndpoints(environment);
  if (action === 'keys') {
    console.log(Object.keys(environment).sort().join('\n'));
    return;
  }
  if (!options.command.length) fail('exec requires a command after "--".');
  const [command, ...args] = options.command;
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  if (result.error?.code === 'ENOENT') {
    console.error(`"${command}" is not available on this host.`);
    process.exit(127);
  }
  process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`native-runtime-env failed: ${error.message}`);
    process.exit(1);
  }
}
