// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConfigurePlan,
  buildInstallPlan,
  buildPostgresUrl,
  buildRedisUrl,
  parseSecretsEnv,
  quoteSqlLiteral,
} from './native-datastores.mjs';

test('install plan installs PostgreSQL and Redis and binds both to loopback', () => {
  const plan = buildInstallPlan();
  const flat = plan.map((step) => [step.command, ...step.args].join(' ')).join('\n');
  assert.match(flat, /apt-get install .*postgresql/u);
  assert.match(flat, /apt-get install .*redis-server/u);
  // Data services must never listen on a public interface.
  assert.ok(
    plan.some((step) => step.title.toLowerCase().includes('loopback')),
    'the plan must contain an explicit loopback-binding step',
  );
  assert.match(flat, /systemctl enable --now postgresql/u);
  assert.match(flat, /systemctl enable --now redis-server/u);
});

test('configure plan creates the role and database idempotently, never dropping data', () => {
  const plan = buildConfigurePlan({
    role: 'nest_react_boilerplate',
    database: 'nest_react_boilerplate',
    password: 'generated-secret',
    redisPassword: 'redis-secret',
  });
  // Statements travel on stdin, so the contract covers argv and stdin together.
  const flat = plan.map((step) => [step.command, ...step.args, step.input ?? ''].join(' ')).join('\n');
  // Guarded creation: only create when absent, and never DROP anything.
  assert.match(flat, /pg_roles/u, 'role creation must be guarded by a catalog lookup');
  assert.match(flat, /CREATE ROLE/u);
  assert.match(flat, /ALTER ROLE/u, 'the generated password must be applied on every run');
  assert.doesNotMatch(flat, /DROP (ROLE|DATABASE|TABLE)/u, 'provisioning must never drop data');
  assert.match(flat, /CREATE DATABASE|createdb/u);
  // The app role must not be a superuser.
  assert.doesNotMatch(flat, /SUPERUSER/u);
  assert.ok(
    plan.every((step) => step.command === 'su' || step.command === 'sh' || step.command === 'redis-cli'),
    'every privileged action runs as the postgres system user or against redis',
  );
});

test('configure plan refuses the postgres superuser as the application role', () => {
  assert.throws(
    () => buildConfigurePlan({ role: 'postgres', database: 'x', password: 'p', redisPassword: 'r' }),
    /dedicated/iu,
  );
});

test('configure plan requires both generated passwords', () => {
  assert.throws(
    () => buildConfigurePlan({ role: 'app', database: 'x', password: '', redisPassword: 'r' }),
    /password/iu,
  );
  assert.throws(() => buildConfigurePlan({ role: 'app', database: 'x', password: 'p', redisPassword: '' }), /redis/iu);
});

test('SQL literals are escaped so a generated password cannot break out', () => {
  assert.equal(quoteSqlLiteral("ab'cd"), "'ab''cd'");
  const plan = buildConfigurePlan({
    role: 'app',
    database: 'db',
    password: "pa'ss",
    redisPassword: 'r',
  });
  const stdin = plan.map((step) => step.input ?? '').join('\n');
  assert.match(stdin, /'pa''ss'/u);
});

test('no generated password is ever passed in argv', () => {
  // /proc/<pid>/cmdline is world-readable, so a password in an argument is visible to
  // every local user while the step runs; secrets must travel on stdin only.
  const password = 'postgres-secret-value';
  const redisPassword = 'redis-secret-value';
  const plan = buildConfigurePlan({ role: 'app', database: 'db', password, redisPassword });
  const argv = plan.map((step) => [step.command, ...step.args].join(' ')).join('\n');
  assert.ok(!argv.includes(password), 'the database password must not appear in argv');
  assert.ok(!argv.includes(redisPassword), 'the redis password must not appear in argv');
  const stdin = plan.map((step) => step.input ?? '').join('\n');
  assert.ok(stdin.includes(password) && stdin.includes(redisPassword), 'both passwords travel on stdin');
  assert.match(argv, /psql -v ON_ERROR_STOP=1 -f -/u, 'psql must read its statements from stdin');
});

test('connection URLs point at loopback and percent-encode credentials', () => {
  assert.equal(
    buildPostgresUrl({ role: 'app', password: 'test p@ss word', database: 'db' }),
    'postgres://app:test%20p%40ss%20word@127.0.0.1:5432/db',
  );
  assert.equal(buildRedisUrl({ password: 'test-p@ss' }), 'redis://:test-p%40ss@127.0.0.1:6379');
});

test('parseSecretsEnv reads the emitted secrets file', () => {
  const parsed = parseSecretsEnv(
    ['# comment', 'POSTGRES_PASSWORD=abc123', 'REDIS_PASSWORD=def456', 'EMPTY='].join('\n'),
  );
  assert.equal(parsed.POSTGRES_PASSWORD, 'abc123');
  assert.equal(parsed.REDIS_PASSWORD, 'def456');
  assert.equal(parsed.EMPTY, '');
});
