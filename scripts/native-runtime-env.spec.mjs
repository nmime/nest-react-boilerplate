// @requirements REQ-SCAFFOLD-SAFETY-008 REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseDeclaredSecrets } from './declared-secrets.mjs';
import {
  applicationResolvedSecretFiles,
  assertNativeEndpoints,
  resolveNativeEnvironment,
  secretFileEnvironmentKeys,
  withoutNativeSecrets,
} from './native-runtime-env.mjs';

test('emitted one-shot credentials replace container indirections without reading those paths', () => {
  const environment = resolveNativeEnvironment({
    production: {
      SESSION_SECRET_FILE: '/run/secrets/session_secret',
      AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE: '/run/secrets/auth_provider_token_encryption_key',
      VITE_API_BASE_URL_MODE: 'same-origin',
    },
    secretsEnvironment: {
      SESSION_SECRET: 'owned-session-fixture',
      AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: 'owned-encryption-fixture',
    },
    readSecret: () => {
      throw new Error('Container-only paths must not be read by the one-shot host wrapper.');
    },
  });
  assert.equal(environment.SESSION_SECRET, 'owned-session-fixture');
  assert.equal(environment.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY, 'owned-encryption-fixture');
  assert.equal(environment.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE, undefined);
  assert.equal(environment.SESSION_SECRET_FILE, undefined);
});

test('build sanitization excludes plaintext, secret paths, inherited keys, and credential URLs', () => {
  const environment = {
    SESSION_SECRET: 'private',
    DATABASE_URL: 'postgres://owned:private@127.0.0.1/test',
    AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE: '/private/path',
    PROVIDER_API_KEY: 'private',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=private',
    NATS_SERVERS: 'nats://owned:private@127.0.0.1',
    VITE_API_BASE_URL_MODE: 'same-origin',
    PATH: '/usr/bin',
  };
  assert.deepEqual(withoutNativeSecrets(environment), { VITE_API_BASE_URL_MODE: 'same-origin', PATH: '/usr/bin' });
  assert.deepEqual(
    resolveNativeEnvironment({
      production: environment,
      includeSecrets: false,
      secretsEnvironment: { BETTER_AUTH_SECRET: 'private' },
      readSecret: () => {
        throw new Error('Build secret read');
      },
    }),
    { VITE_API_BASE_URL_MODE: 'same-origin', PATH: '/usr/bin' },
  );
});

test('external one-shot credentials use inherited values when emitted placeholders are empty', () => {
  const environment = resolveNativeEnvironment({
    production: { DATABASE_URL_FILE: '/run/secrets/database_url', SESSION_SECRET_FILE: '/run/secrets/session_secret' },
    inheritedEnvironment: {
      DATABASE_URL: 'postgres://owned:fixture@127.0.0.1/nrb_test',
      SESSION_SECRET: 'ambient-fixture',
    },
    secretsEnvironment: { DATABASE_URL: '', SESSION_SECRET: 'emitted-fixture' },
    readSecret: () => {
      throw new Error('A supplied credential must bypass the container-only file.');
    },
  });
  assert.equal(environment.DATABASE_URL, 'postgres://owned:fixture@127.0.0.1/nrb_test');
  assert.equal(environment.SESSION_SECRET, 'emitted-fixture');
});

test('malformed credential URLs never appear in validation diagnostics', () => {
  const secret = 'owned-malformed-secret-value';
  assert.throws(
    () => assertNativeEndpoints({ DATABASE_URL: secret }),
    (error) => {
      assert.match(error.message, /DATABASE_URL must be a valid URL/u);
      assert.ok(!error.message.includes(secret));
      return true;
    },
  );
});

test('real child processes receive runtime credentials while build children exclude inherited and configured secrets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-native-env-'));
  const productionEnv = join(directory, 'production.env');
  const secretsEnv = join(directory, 'runtime.env');
  writeFileSync(productionEnv, 'SESSION_SECRET_FILE=/run/secrets/session_secret\nVITE_API_BASE_URL_MODE=same-origin\n');
  writeFileSync(secretsEnv, 'SESSION_SECRET=owned-runtime-fixture\n', { mode: 0o600 });
  const wrapper = new URL('./native-runtime-env.mjs', import.meta.url).pathname;
  try {
    const runtime = spawnSync(
      process.execPath,
      [
        wrapper,
        'exec',
        `--production-env=${productionEnv}`,
        `--secrets-env=${secretsEnv}`,
        '--',
        process.execPath,
        '-e',
        "require('node:assert/strict').equal(process.env.SESSION_SECRET, 'owned-runtime-fixture');",
      ],
      { encoding: 'utf8' },
    );
    assert.equal(runtime.status, 0, runtime.stderr);
    const build = spawnSync(
      process.execPath,
      [
        wrapper,
        'exec',
        `--production-env=${productionEnv}`,
        '--no-secrets',
        '--',
        process.execPath,
        '-e',
        "const a = require('node:assert/strict'); for (const key of ['SESSION_SECRET','DATABASE_URL','PROVIDER_API_KEY']) a.equal(process.env[key], undefined); a.equal(process.env.VITE_API_BASE_URL_MODE,'same-origin');",
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          SESSION_SECRET: 'inherited-fixture',
          DATABASE_URL: 'postgres://owned:fixture@127.0.0.1/test',
          PROVIDER_API_KEY: 'inherited-fixture',
        },
      },
    );
    assert.equal(build.status, 0, build.stderr);
    assert.ok(!runtime.stdout.includes('owned-runtime-fixture'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const secrets = {
  '/etc/nrb/secrets/session_secret.txt': 'session-material\n',
  '/etc/nrb/secrets/postgres_password.txt': 'test+password/fixture=\n',
  '/etc/nrb/secrets/telegram_bot_token.txt': '',
};
const readSecret = (path) => {
  if (!(path in secrets)) throw new Error(`unexpected secret read: ${path}`);
  return secrets[path];
};

const production = {
  COMPOSE_DATABASE_MODE: 'native',
  POSTGRES_USER: 'nest_react_boilerplate',
  POSTGRES_DB: 'nest_react_boilerplate',
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PORT: '5432',
  SESSION_SECRET_FILE: '/etc/nrb/secrets/session_secret.txt',
  POSTGRES_PASSWORD_FILE: '/etc/nrb/secrets/postgres_password.txt',
  TELEGRAM_BOT_TOKEN_FILE: '/etc/nrb/secrets/telegram_bot_token.txt',
  AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE: '/etc/nrb/secrets/auth_key.txt',
  VITE_API_BASE_URL_MODE: 'same-origin',
};

test('carries every secret the container entrypoint loads', () => {
  // docker/secret-entrypoint.sh is the workspace's one enumeration of application secrets, and
  // every other consumer derives from it. A second list here means a native deployment silently
  // starts without whatever the copy forgot -- the MongoDB credentials and the push-notification
  // signing keys, when this was found -- and the process only fails much later, at first use.
  const entrypoint = readFileSync(new URL('../docker/secret-entrypoint.sh', import.meta.url), 'utf8');
  const declared = [...new Set(parseDeclaredSecrets(entrypoint).map(({ variable }) => variable))];

  assert.deepEqual(
    declared.filter(
      (variable) =>
        !(`${variable}_FILE` in secretFileEnvironmentKeys) && !applicationResolvedSecretFiles.has(`${variable}_FILE`),
    ),
    [],
  );
  // Nothing in the other direction either: a native-only entry would be a secret no container
  // deployment ever receives.
  assert.deepEqual(
    Object.values(secretFileEnvironmentKeys).filter((variable) => !declared.includes(variable)),
    [],
  );
});

test('dereferences secret files into the plain variables the application reads', () => {
  const environment = resolveNativeEnvironment({ production, readSecret });
  assert.equal(environment.SESSION_SECRET, 'session-material');
  assert.equal(environment.POSTGRES_PASSWORD, 'test+password/fixture=');
  // The resolved indirection is dropped so nothing sees two sources for one secret.
  assert.equal(environment.SESSION_SECRET_FILE, undefined);
  assert.equal(environment.VITE_API_BASE_URL_MODE, 'same-origin', 'non-secret configuration passes through');
});

test('leaves the two keys the application resolves itself as paths', () => {
  const environment = resolveNativeEnvironment({ production, readSecret });
  // Setting both the plain key and its _FILE sibling aborts startup with
  // "Configure only one of ...", so these must never be dereferenced here.
  assert.equal(environment.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE, '/etc/nrb/secrets/auth_key.txt');
  assert.equal(environment.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY, undefined);
  for (const key of applicationResolvedSecretFiles) {
    assert.ok(!(key in secretFileEnvironmentKeys), `${key} must not be in the dereference table`);
  }
});

test('leaves an empty placeholder secret unset so required-key checks still fire', () => {
  const environment = resolveNativeEnvironment({ production, readSecret });
  assert.ok(!('TELEGRAM_BOT_TOKEN' in environment), 'an unissued secret must not become an empty string');
});

test('composes a percent-encoded DATABASE_URL for a host database', () => {
  const environment = resolveNativeEnvironment({ production, readSecret });
  // Generated passwords are base64: +, / and = must be encoded or the URL carries a
  // different password and only Better Auth fails, at login time.
  assert.equal(
    environment.DATABASE_URL,
    'postgres://nest_react_boilerplate:test%2Bpassword%2Ffixture%3D@127.0.0.1:5432/nest_react_boilerplate',
  );
});

test('never composes a DATABASE_URL over an explicitly configured one', () => {
  const environment = resolveNativeEnvironment({
    production: { ...production, DATABASE_URL_FILE: '/etc/nrb/secrets/session_secret.txt' },
    readSecret,
  });
  assert.equal(environment.DATABASE_URL, 'session-material');
});

test('build steps can resolve configuration without any credentials', () => {
  const environment = resolveNativeEnvironment({ production, readSecret, includeSecrets: false });
  assert.equal(environment.VITE_API_BASE_URL_MODE, 'same-origin');
  for (const key of ['SESSION_SECRET', 'POSTGRES_PASSWORD', 'DATABASE_URL']) {
    assert.ok(!(key in environment), `${key} must not reach a build process`);
  }
});

test('requires database identity when it has to compose the URL', () => {
  assert.throws(
    () => resolveNativeEnvironment({ production: { ...production, POSTGRES_DB: '' }, readSecret }),
    /POSTGRES_USER and POSTGRES_DB/u,
  );
  assert.throws(
    () => resolveNativeEnvironment({ production: { ...production, POSTGRES_PASSWORD_FILE: '' }, readSecret }),
    /POSTGRES_PASSWORD_FILE/u,
  );
});

test('rejects container service names that cannot resolve on a native host', () => {
  // Compose aliases are bare single labels; a real external endpoint is dotted or an IP.
  assert.throws(() => assertNativeEndpoints({ POSTGRES_HOST: 'postgres' }), /container service name/u);
  assert.throws(() => assertNativeEndpoints({ REDIS_URL: 'redis://redis:6379/0' }), /container service name/u);
  assert.throws(
    () => assertNativeEndpoints({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318' }),
    /container service name/u,
  );
  assert.throws(() => assertNativeEndpoints({ REDIS_HOSTS: 'redis:6379' }), /container service name/u);
  // NATS_SERVERS is a comma-separated list, so every entry has to be checked.
  assert.throws(
    () => assertNativeEndpoints({ NATS_SERVERS: 'nats://events.example.com:4222,nats:4222' }),
    /container service name/u,
  );
});

test('accepts loopback and real external endpoints', () => {
  assertNativeEndpoints({
    POSTGRES_HOST: '127.0.0.1',
    REDIS_URL: 'redis://127.0.0.1:6379/0',
    NATS_SERVERS: 'nats://events.internal.example:4222,events2.internal.example:4222',
    DATABASE_URL: 'postgres://app:secret@db.example.com:5432/app',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  });
  assertNativeEndpoints({ NATS_SERVERS: 'nats://owned:private-fixture@[::1]:4222', REDIS_HOSTS: '[::1]:6379' });
  assert.throws(
    () => assertNativeEndpoints({ NATS_SERVERS: 'nats://owned:private-fixture@[' }),
    (error) => {
      assert.match(error.message, /invalid native endpoint/u);
      assert.ok(!error.message.includes('private-fixture'));
      return true;
    },
  );
});
