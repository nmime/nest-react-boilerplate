#!/usr/bin/env node
/**
 * compose-production-init — scaffold a production Docker Compose deployment.
 *
 * Turns the Compose prod path into `init -> pull -> up`: it copies the env
 * example (if absent), generates every locally-generatable secret with strong
 * entropy (matching the single-server `serverctl` generators), and creates
 * empty 0600 placeholder files for secrets that must be pasted from a third
 * party (DATABASE_URL, provider tokens, push keys). It is idempotent: existing
 * secret files are never overwritten unless --force is passed.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');

/**
 * Secrets we can safely generate locally, with the byte length fed to the
 * base64 encoder. Everything else declared by an overlay is treated as an
 * externally-issued secret and gets an empty placeholder file.
 */
export const generatableSecrets = {
  session_secret: 48,
  better_auth_secret: 48,
  auth_provider_token_encryption_key: 32,
  notification_payload_encryption_key: 32,
  redis_password: 32,
  grafana_admin_password: 32,
  postgres_password: 32,
  telegram_bot_webhook_secret: 32,
  discord_custom_id_secret: 32,
};

/** The overlay files contributing top-level `secrets:` for a given topology. */
export function computeOverlayFiles({ database = 'bundled-db', profiles = [] } = {}) {
  // A host-installed PostgreSQL has no compose overlay, but the native runtime needs
  // the same generated password, so reuse the bundled-db secret set for discovery.
  const secretSource = database === 'native' ? 'bundled-db' : database;
  const files = ['docker/docker-compose.prod.yml', `docker/docker-compose.prod.${secretSource}.yml`];
  if (profiles.includes('telegram')) files.push('docker/docker-compose.prod.telegram.yml');
  if (profiles.includes('discord')) files.push('docker/docker-compose.prod.discord.yml');
  return files;
}

/** Parse the top-level `secrets:` block of a compose file into secret names. */
export function parseSecretNames(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const names = [];
  let inSecrets = false;
  for (const line of lines) {
    if (/^secrets:\s*$/.test(line)) {
      inSecrets = true;
      continue;
    }
    if (inSecrets) {
      if (/^\S/.test(line)) break; // dedented to a new top-level key
      const match = line.match(/^ {2}([a-z0-9_]+):\s*$/);
      if (match) names.push(match[1]);
    }
  }
  return names;
}

export function classifySecret(name) {
  return Object.prototype.hasOwnProperty.call(generatableSecrets, name) ? 'generate' : 'external';
}

export function generateSecretValue(name) {
  const length = generatableSecrets[name] ?? 32;
  return randomBytes(length).toString('base64');
}

/**
 * Given the full set of required secret names and which files already exist,
 * decide what to do. Pure — no filesystem access.
 */
export function planScaffold({ secretNames, existing = new Set(), force = false }) {
  const plan = { generate: [], placeholder: [], skip: [] };
  for (const name of [...new Set(secretNames)].sort()) {
    const kind = classifySecret(name);
    const alreadyExists = existing.has(name);
    if (alreadyExists && !(force && kind === 'generate')) {
      plan.skip.push(name);
    } else if (kind === 'generate') {
      plan.generate.push(name);
    } else {
      plan.placeholder.push(name);
    }
  }
  return plan;
}

/**
 * Validate a base DNS domain the same way the Compose wrapper does: a bare
 * hostname, no scheme/port/path/wildcard.
 */
export function validateDomain(value) {
  const domain = String(value).trim().toLowerCase().replace(/\.$/u, '');
  const labels = domain.split('.');
  const validLabel = (label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label);
  if (domain === '' || labels.length < 2 || !labels.every(validLabel)) {
    throw new Error(
      `Invalid domain "${value}": pass a bare DNS base name such as acme.example (no scheme, port, path, or wildcard).`,
    );
  }
  return domain;
}

/**
 * Set `KEY=value` for each entry, replacing an existing assignment in place and
 * appending anything missing. Pure — returns the new file contents.
 */
export function upsertEnvValues(content, values) {
  let output = content;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const pattern = new RegExp(`^${key}=.*$`, 'mu');
    const line = `${key}=${value}`;
    output = pattern.test(output)
      ? output.replace(pattern, line)
      : `${output.endsWith('\n') ? output : `${output}\n`}${line}\n`;
  }
  return output;
}

/** Minimal `KEY=value` reader used only to discover defaults from an env file. */
function readEnvValue(envPath, key) {
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

function parseArgs(argv) {
  const options = {
    envFile: '.env.production',
    exampleFile: '.env.production.example',
    secretsDir: 'docker/secrets',
    database: undefined,
    profiles: undefined,
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => argv[++i];
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    // NB: `--env-out`, not `--env-file`: Node 24 reserves `--env-file` as a
    // built-in flag it parses out of argv (and errors on a missing path) before
    // this script runs — fatal for init, whose job is to create that file.
    else if (arg === '--env-out') options.envFile = take();
    else if (arg.startsWith('--env-out=')) options.envFile = arg.slice('--env-out='.length);
    else if (arg === '--secrets-dir') options.secretsDir = take();
    else if (arg.startsWith('--secrets-dir=')) options.secretsDir = arg.slice('--secrets-dir='.length);
    else if (arg === '--database') options.database = take();
    else if (arg.startsWith('--database=')) options.database = arg.slice('--database='.length);
    else if (arg === '--domain') options.domain = take();
    else if (arg.startsWith('--domain=')) options.domain = arg.slice('--domain='.length);
    else if (arg === '--registry') options.registry = take();
    else if (arg.startsWith('--registry=')) options.registry = arg.slice('--registry='.length);
    else if (arg === '--image-tag') options.imageTag = take();
    else if (arg.startsWith('--image-tag=')) options.imageTag = arg.slice('--image-tag='.length);
    // Topology axes: persisted so the Compose wrapper, the host-nginx renderer, and
    // serverctl all read the same selection instead of the example defaults.
    else if (arg === '--domain-mode') options.domainMode = take();
    else if (arg.startsWith('--domain-mode=')) options.domainMode = arg.slice('--domain-mode='.length);
    else if (arg === '--tls-mode') options.tlsMode = take();
    else if (arg.startsWith('--tls-mode=')) options.tlsMode = arg.slice('--tls-mode='.length);
    else if (arg === '--public-mode') options.publicMode = take();
    else if (arg.startsWith('--public-mode=')) options.publicMode = arg.slice('--public-mode='.length);
    else if (arg === '--primary-app') options.primaryApp = take();
    else if (arg.startsWith('--primary-app=')) options.primaryApp = arg.slice('--primary-app='.length);
    else if (arg === '--frontend-mode') options.frontendMode = take();
    else if (arg.startsWith('--frontend-mode=')) options.frontendMode = arg.slice('--frontend-mode='.length);
    else if (arg === '--emit-env') options.emitEnv = take();
    else if (arg.startsWith('--emit-env=')) options.emitEnv = arg.slice('--emit-env='.length);
    else if (arg === '--image-source') options.imageSource = take();
    else if (arg.startsWith('--image-source=')) options.imageSource = arg.slice('--image-source='.length);
    else if (arg === '--profile') options.profiles = take();
    else if (arg.startsWith('--profile=')) options.profiles = arg.slice('--profile='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * Run the scaffolder. Returns a structured summary so callers/tests can assert
 * on the outcome without parsing stdout.
 */
export function run(argv = [], { root = repoRoot } = {}) {
  const options = parseArgs(argv);
  const envPath = resolve(root, options.envFile);
  const examplePath = resolve(root, options.exampleFile);
  const secretsDir = resolve(root, options.secretsDir);
  const summary = { copiedEnv: false, generated: [], placeholders: [], skipped: [], secretsDir };

  // Validate before touching the filesystem so a bad domain never leaves a
  // half-written env file behind.
  const domain = options.domain === undefined ? undefined : validateDomain(options.domain);

  if (!existsSync(envPath)) {
    if (!existsSync(examplePath)) {
      throw new Error(`Neither ${options.envFile} nor ${options.exampleFile} exists; cannot initialize.`);
    }
    if (!options.dryRun) copyFileSync(examplePath, envPath);
    summary.copiedEnv = true;
  }

  // Apply the operator-supplied identity so `PUBLIC_DOMAIN`/registry/tag are real
  // values rather than the example placeholders. Topology axes are written only when
  // explicitly selected, so an unflagged run never invents a value — the copied
  // example keeps its own defaults.
  const envUpdates = {
    PUBLIC_DOMAIN: domain,
    IMAGE_REGISTRY: options.registry,
    IMAGE_TAG: options.imageTag,
    COMPOSE_DATABASE_MODE: options.database,
    COMPOSE_DOMAIN_MODE: options.domainMode,
    COMPOSE_TLS_MODE: options.tlsMode,
    // Only meaningful for COMPOSE_DOMAIN_MODE=external-proxy; it selects the
    // hostname layout the host proxy (nginx) will serve.
    EXTERNAL_PROXY_PUBLIC_MODE: options.publicMode,
    PRIMARY_APP: options.primaryApp,
    COMPOSE_PROFILES: options.profiles,
    COMPOSE_IMAGE_SOURCE: options.imageSource,
    EXTERNAL_PROXY_FRONTEND_MODE: options.frontendMode,
    // The shipped example defaults POSTGRES_USER to the postgres superuser, which
    // must never be the application role on a host-installed server.
    ...(options.database === 'native'
      ? {
          POSTGRES_USER: 'nest_react_boilerplate',
          POSTGRES_DB: 'nest_react_boilerplate',
          POSTGRES_HOST: '127.0.0.1',
          POSTGRES_PORT: '5432',
        }
      : {}),
  };
  if (!options.dryRun && Object.values(envUpdates).some((value) => value !== undefined)) {
    writeFileSync(envPath, upsertEnvValues(readFileSync(envPath, 'utf8'), envUpdates));
  }
  summary.envUpdates = Object.fromEntries(Object.entries(envUpdates).filter(([, value]) => value !== undefined));

  const database = options.database ?? readEnvValue(envPath, 'COMPOSE_DATABASE_MODE') ?? 'bundled-db';
  const profiles = (options.profiles ?? readEnvValue(envPath, 'COMPOSE_PROFILES') ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);

  const overlayFiles = computeOverlayFiles({ database, profiles });
  const secretNames = [];
  for (const file of overlayFiles) {
    const full = resolve(root, file);
    if (existsSync(full)) secretNames.push(...parseSecretNames(readFileSync(full, 'utf8')));
  }

  const fileFor = (name) => join(secretsDir, `${name}.txt`);
  const existing = new Set([...new Set(secretNames)].filter((name) => existsSync(fileFor(name))));
  const plan = planScaffold({ secretNames, existing, force: options.force });

  if (!options.dryRun) mkdirSync(secretsDir, { recursive: true });

  for (const name of plan.generate) {
    if (!options.dryRun) {
      writeFileSync(fileFor(name), `${generateSecretValue(name)}\n`, { mode: 0o600 });
      chmodSync(fileFor(name), 0o600);
    }
    summary.generated.push(name);
  }
  for (const name of plan.placeholder) {
    if (!options.dryRun) {
      writeFileSync(fileFor(name), '', { mode: 0o600 });
      chmodSync(fileFor(name), 0o600);
    }
    summary.placeholders.push(name);
  }
  // Non-container runtimes (PM2) take secrets from the environment rather than
  // /run/secrets, so optionally emit the same material as an env file. Generated
  // values are filled in; externally issued ones stay empty and visible.
  if (options.emitEnv && !options.dryRun) {
    const emitPath = resolve(root, options.emitEnv);
    const lines = [
      '# Generated by compose-production-init. Source this before starting the app.',
      '# Never commit this file.',
    ];
    for (const name of [...new Set(secretNames)].sort()) {
      const file = fileFor(name);
      const value = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
      lines.push(`${name.toUpperCase()}=${value}`);
    }
    writeFileSync(emitPath, `${lines.join('\n')}\n`, { mode: 0o600 });
    chmodSync(emitPath, 0o600);
    summary.emittedEnv = emitPath;
  }
  summary.skipped = plan.skip;
  summary.database = database;
  summary.profiles = profiles;
  return summary;
}

function main() {
  const summary = run(process.argv.slice(2));
  const rel = (n) => `${summary.secretsDir.replace(`${repoRoot}/`, '')}/${n}.txt`;
  const requiredKeys = ['PUBLIC_DOMAIN', 'IMAGE_REGISTRY', 'IMAGE_TAG'];
  const stillPlaceholder = requiredKeys.filter((key) => summary.envUpdates?.[key] === undefined);
  if (summary.copiedEnv) console.log('✓ created .env.production from the example');
  for (const [key, value] of Object.entries(summary.envUpdates ?? {})) {
    console.log(`✓ set ${key}=${value}`);
  }
  if (stillPlaceholder.length > 0) {
    console.log(`• still on example values — edit .env.production: ${stillPlaceholder.join(', ')}`);
  }
  console.log(`✓ database mode: ${summary.database}; profiles: ${summary.profiles.join(', ') || '(none)'}`);
  if (summary.generated.length)
    console.log(`✓ generated ${summary.generated.length} secret(s): ${summary.generated.join(', ')}`);
  if (summary.skipped.length) console.log(`• kept ${summary.skipped.length} existing secret file(s)`);
  if (summary.placeholders.length) {
    console.log(`\n⚠ Fill these externally-issued secret files before \`pnpm docker:prod:up\`:`);
    for (const name of summary.placeholders) console.log(`    ${rel(name)}`);
  }
  console.log(`\nNext: pnpm docker:prod:config  →  pnpm docker:prod:pull  →  pnpm docker:prod:up`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`compose-production-init failed: ${error.message}`);
    process.exit(1);
  }
}
