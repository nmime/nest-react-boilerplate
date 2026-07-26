// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import test from 'node:test';
import {
  classifySecret,
  computeOverlayFiles,
  generateSecretValue,
  parseSecretNames,
  planScaffold,
  run,
  repoRoot,
} from './compose-production-init.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('computeOverlayFiles selects the base + database overlay and profile overlays', () => {
  assert.deepEqual(computeOverlayFiles({ database: 'bundled-db', profiles: [] }), [
    'docker/docker-compose.prod.yml',
    'docker/docker-compose.prod.bundled-db.yml',
  ]);
  assert.deepEqual(computeOverlayFiles({ database: 'external-db', profiles: ['telegram', 'discord'] }), [
    'docker/docker-compose.prod.yml',
    'docker/docker-compose.prod.external-db.yml',
    'docker/docker-compose.prod.telegram.yml',
    'docker/docker-compose.prod.discord.yml',
  ]);
});

test('parseSecretNames reads the real base overlay secrets and stops at the next top-level key', () => {
  const base = readFileSync(resolve(repoRoot, 'docker/docker-compose.prod.yml'), 'utf8');
  const names = parseSecretNames(base);
  assert.ok(names.includes('session_secret'));
  assert.ok(names.includes('notification_payload_encryption_key'));
  assert.ok(!names.includes('services')); // did not bleed into another block
});

test('classifySecret splits generatable secrets from externally-issued ones', () => {
  assert.equal(classifySecret('session_secret'), 'generate');
  assert.equal(classifySecret('postgres_password'), 'generate');
  assert.equal(classifySecret('database_url'), 'external');
  assert.equal(classifySecret('telegram_bot_token'), 'external');
  assert.equal(classifySecret('resend_api_key'), 'external');
});

test('generateSecretValue produces distinct high-entropy values of the configured length', () => {
  const a = generateSecretValue('session_secret');
  const b = generateSecretValue('session_secret');
  assert.notEqual(a, b);
  // 48 random bytes base64-encode to 64 characters.
  assert.equal(a.length, 64);
  assert.equal(generateSecretValue('redis_password').length, 44); // 32 bytes -> 44 chars
});

test('planScaffold generates missing secrets, places holders for external, and skips existing', () => {
  const plan = planScaffold({
    secretNames: ['session_secret', 'database_url', 'redis_password'],
    existing: new Set(['redis_password']),
  });
  assert.deepEqual(plan.generate, ['session_secret']);
  assert.deepEqual(plan.placeholder, ['database_url']);
  assert.deepEqual(plan.skip, ['redis_password']);
});

test('planScaffold with --force regenerates existing generatable secrets but never external ones', () => {
  const plan = planScaffold({
    secretNames: ['session_secret', 'database_url'],
    existing: new Set(['session_secret', 'database_url']),
    force: true,
  });
  assert.deepEqual(plan.generate, ['session_secret']);
  assert.deepEqual(plan.skip, ['database_url']);
});

function withTempRoot() {
  // A minimal root that reuses the real overlays + example but an isolated secrets dir.
  const dir = mkdtempSync(join(tmpdir(), 'nrb-compose-init-'));
  return dir;
}

test('run scaffolds real generatable secrets and empty external placeholders (idempotently)', () => {
  const tmp = withTempRoot();
  const summary = run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', join(tmp, '.env.production')], {
    root: repoRoot,
  });
  assert.ok(summary.copiedEnv, 'should copy the env example when missing');
  assert.ok(existsSync(join(tmp, '.env.production')));

  // Generatable base secret: non-empty, mode 0600.
  const sessionFile = join(tmp, 'secrets', 'session_secret.txt');
  assert.ok(existsSync(sessionFile));
  assert.ok(readFileSync(sessionFile, 'utf8').trim().length >= 40);
  assert.equal(statSync(sessionFile).mode & 0o777, 0o600);

  // External secret (email provider): present but empty, awaiting the operator.
  const resendFile = join(tmp, 'secrets', 'resend_api_key.txt');
  assert.ok(existsSync(resendFile));
  assert.equal(readFileSync(resendFile, 'utf8'), '');
  assert.ok(summary.placeholders.includes('resend_api_key'));
  assert.ok(summary.generated.includes('session_secret'));

  // Idempotent: a second run keeps every existing file (skips all).
  const before = readFileSync(sessionFile, 'utf8');
  const second = run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', join(tmp, '.env.production')], {
    root: repoRoot,
  });
  assert.equal(second.generated.length, 0);
  assert.equal(readFileSync(sessionFile, 'utf8'), before, 'existing secret must not be overwritten');
  assert.ok(second.skipped.includes('session_secret'));
});

test('run --dry-run writes nothing', () => {
  const tmp = withTempRoot();
  const summary = run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', join(tmp, '.env.production'), '--dry-run'], {
    root: repoRoot,
  });
  assert.ok(summary.generated.length > 0, 'dry-run still reports what it would generate');
  assert.ok(!existsSync(join(tmp, 'secrets')), 'dry-run must not create the secrets dir');
  assert.ok(!existsSync(join(tmp, '.env.production')), 'dry-run must not copy the env file');
});

test('run writes the supplied domain, registry, and image tag into the env file', () => {
  const tmp = withTempRoot();
  const envPath = join(tmp, '.env.production');
  run(
    [
      '--secrets-dir',
      join(tmp, 'secrets'),
      '--env-out',
      envPath,
      '--domain',
      'acme.example',
      '--registry',
      'ghcr.io/acme-org/acme',
      '--image-tag',
      'sha-0123456789abcdef0123456789abcdef01234567',
    ],
    { root: repoRoot },
  );
  const env = readFileSync(envPath, 'utf8');
  assert.match(env, /^PUBLIC_DOMAIN=acme\.example$/mu, 'PUBLIC_DOMAIN must be set from --domain');
  assert.match(env, /^IMAGE_REGISTRY=ghcr\.io\/acme-org\/acme$/mu);
  assert.match(env, /^IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567$/mu);
  assert.doesNotMatch(env, /^PUBLIC_DOMAIN=example\.com$/mu, 'the example domain must not survive');
});

test('run persists every topology axis into the env file', () => {
  const tmp = withTempRoot();
  const envPath = join(tmp, '.env.production');
  const summary = run(
    [
      '--secrets-dir',
      join(tmp, 'secrets'),
      '--env-out',
      envPath,
      '--domain',
      'acme.example',
      '--database',
      'external-db',
      '--domain-mode',
      'external-proxy',
      '--tls-mode',
      'external',
      '--public-mode',
      'single-domain',
      '--primary-app',
      'site-app',
      '--profile',
      'telegram,discord',
    ],
    { root: repoRoot },
  );
  const env = readFileSync(envPath, 'utf8');
  assert.match(env, /^COMPOSE_DATABASE_MODE=external-db$/mu);
  assert.match(env, /^COMPOSE_DOMAIN_MODE=external-proxy$/mu);
  assert.match(env, /^COMPOSE_TLS_MODE=external$/mu);
  // The host-proxy hostname layout must be persisted, not left at the example default.
  assert.match(env, /^EXTERNAL_PROXY_PUBLIC_MODE=single-domain$/mu);
  assert.match(env, /^PRIMARY_APP=site-app$/mu);
  assert.match(env, /^COMPOSE_PROFILES=telegram,discord$/mu);
  assert.equal(summary.envUpdates.COMPOSE_DOMAIN_MODE, 'external-proxy');
});

test('run leaves topology keys untouched when no axis flags are passed', () => {
  const tmp = withTempRoot();
  const envPath = join(tmp, '.env.production');
  const summary = run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', envPath], { root: repoRoot });
  assert.equal(summary.envUpdates.COMPOSE_DOMAIN_MODE, undefined);
  assert.equal(summary.envUpdates.EXTERNAL_PROXY_PUBLIC_MODE, undefined);
  // The copied example still carries its own defaults; init must not invent values.
  assert.match(readFileSync(envPath, 'utf8'), /^COMPOSE_DATABASE_MODE=/mu);
});

test('run can emit the generated secrets as an env file for non-container runtimes', () => {
  const tmp = withTempRoot();
  const emitted = join(tmp, 'runtime-secrets.env');
  const summary = run(
    ['--secrets-dir', join(tmp, 'secrets'), '--env-out', join(tmp, '.env.production'), '--emit-env', emitted],
    { root: repoRoot },
  );
  const text = readFileSync(emitted, 'utf8');
  // Generated secrets carry their value; PM2 sources this before `pm2 start`.
  assert.match(text, /^SESSION_SECRET=.{40,}$/mu);
  assert.match(text, /^POSTGRES_PASSWORD=.{20,}$/mu);
  assert.match(text, /^NOTIFICATION_PAYLOAD_ENCRYPTION_KEY=.{20,}$/mu);
  // Externally issued ones are present but empty, so the operator can see what is missing.
  assert.match(text, /^RESEND_API_KEY=$/mu);
  assert.equal(statSync(emitted).mode & 0o777, 0o600);
  assert.equal(summary.emittedEnv, emitted);
});

test('native database reuses the bundled-db secret set (it needs a Postgres password)', () => {
  // There is no compose overlay for a host-installed PostgreSQL, but the native
  // runtime still needs the same generated password.
  assert.deepEqual(computeOverlayFiles({ database: 'native', profiles: [] }), [
    'docker/docker-compose.prod.yml',
    'docker/docker-compose.prod.bundled-db.yml',
  ]);
  const tmp = withTempRoot();
  const summary = run(
    ['--secrets-dir', join(tmp, 'secrets'), '--env-out', join(tmp, '.env.production'), '--database', 'native'],
    { root: repoRoot },
  );
  assert.ok(summary.generated.includes('postgres_password'));
  assert.ok(summary.generated.includes('redis_password'));
  assert.ok(!summary.placeholders.includes('database_url'), 'a native database needs no external URL');
});

test('native database writes a dedicated non-superuser role into the env file', () => {
  const tmp = withTempRoot();
  const envPath = join(tmp, '.env.production');
  run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', envPath, '--database', 'native'], { root: repoRoot });
  const env = readFileSync(envPath, 'utf8');
  // The shipped example defaults to POSTGRES_USER=postgres, which must never be
  // used as the application role on a native install.
  assert.match(env, /^POSTGRES_USER=nest_react_boilerplate$/mu);
  assert.match(env, /^POSTGRES_HOST=127\.0\.0\.1$/mu);
  assert.doesNotMatch(env, /^POSTGRES_USER=postgres$/mu);
});

test('frontend mode is persisted for the host nginx renderer', () => {
  const tmp = withTempRoot();
  const envPath = join(tmp, '.env.production');
  run(['--secrets-dir', join(tmp, 'secrets'), '--env-out', envPath, '--frontend-mode', 'static'], { root: repoRoot });
  assert.match(readFileSync(envPath, 'utf8'), /^EXTERNAL_PROXY_FRONTEND_MODE=static$/mu);
});

test('run refuses an invalid domain instead of writing a broken env file', () => {
  const tmp = withTempRoot();
  assert.throws(
    () =>
      run(
        [
          '--secrets-dir',
          join(tmp, 'secrets'),
          '--env-out',
          join(tmp, '.env.production'),
          '--domain',
          'https://acme.example/x',
        ],
        {
          root: repoRoot,
        },
      ),
    /domain/iu,
  );
});

test('run in bundled-db mode scaffolds postgres_password, external-db scaffolds database_url', () => {
  const tmpA = withTempRoot();
  const bundled = run(
    ['--secrets-dir', join(tmpA, 'secrets'), '--env-out', join(tmpA, '.env.production'), '--database', 'bundled-db'],
    { root: repoRoot },
  );
  assert.ok(bundled.generated.includes('postgres_password'));
  assert.ok(!existsSync(join(tmpA, 'secrets', 'database_url.txt')));

  const tmpB = withTempRoot();
  const external = run(
    ['--secrets-dir', join(tmpB, 'secrets'), '--env-out', join(tmpB, '.env.production'), '--database', 'external-db'],
    { root: repoRoot },
  );
  assert.ok(external.placeholders.includes('database_url'));
  assert.ok(!existsSync(join(tmpB, 'secrets', 'postgres_password.txt')));
});
