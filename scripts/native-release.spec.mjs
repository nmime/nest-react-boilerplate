// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNativeReleasePlan,
  derivePm2Flags,
  expectedPm2Apps,
  nativeEnvironmentWrapper,
} from './native-release.mjs';

const titles = (plan) => plan.map((item) => item.title);

test('the release sequence installs, builds, publishes, migrates, then reloads', () => {
  const plan = buildNativeReleasePlan({ appRoot: '/opt/nrb', distRoot: '/srv/nrb/frontend' });
  assert.deepEqual(titles(plan), [
    'Install workspace dependencies',
    'Build applications',
    'Publish the built frontends',
    'Run database migrations',
    'Start or reload PM2 services',
    'Persist the PM2 process list',
  ]);
  // Migrations must precede the reload, or autorestart crash-loops the APIs against
  // a schema they do not match.
  assert.ok(titles(plan).indexOf('Run database migrations') < titles(plan).indexOf('Start or reload PM2 services'));
  // The frontend is published before anything serves it, and never from the checkout.
  assert.ok(titles(plan).indexOf('Build applications') < titles(plan).indexOf('Publish the built frontends'));
});

test('publishing copies the built tree into a root-owned web root with readable modes', () => {
  const [publish] = buildNativeReleasePlan({ appRoot: '/opt/nrb/', distRoot: '/srv/nrb/frontend/' }).filter(
    (item) => item.title === 'Publish the built frontends',
  );
  assert.equal(publish.command, 'rsync');
  assert.deepEqual(publish.args, [
    '-a',
    '--delete',
    '--chmod=D755,F644',
    '/opt/nrb/dist/apps/frontend/',
    '/srv/nrb/frontend/',
  ]);
  assert.equal(publish.sudo, true, 'the web root is root-owned so nginx can read it');
});

test('a deployment without a publish target skips the publish step', () => {
  const plan = buildNativeReleasePlan({ appRoot: '/opt/nrb' });
  assert.ok(!titles(plan).includes('Publish the built frontends'));
});

test('a rollback release never re-runs forward-only migrations', () => {
  const plan = buildNativeReleasePlan({ skipMigrations: true });
  assert.ok(!titles(plan).includes('Run database migrations'));
  assert.ok(titles(plan).includes('Start or reload PM2 services'));
});

test('the build runs with configuration but without credentials', () => {
  const plan = buildNativeReleasePlan({
    withEnvironment: nativeEnvironmentWrapper({ productionEnv: '/etc/nrb/.env.production', node: '/usr/bin/node' }),
  });
  const build = plan.find((item) => item.title === 'Build applications');
  const migrate = plan.find((item) => item.title === 'Run database migrations');
  // VITE_* flags are baked in at build time, so the build needs the environment...
  assert.equal(build.command, '/usr/bin/node');
  assert.ok(build.args.includes('--production-env=/etc/nrb/.env.production'));
  assert.ok(build.args.includes('--no-secrets'), 'a build must never receive credentials');
  assert.deepEqual(build.args.slice(-4), ['--', 'pnpm', 'run', 'build']);
  // ...while migrations need the resolved DATABASE_URL.
  assert.ok(!migrate.args.includes('--no-secrets'));
});

test('reloading updates the environment so rotated secrets take effect', () => {
  const plan = buildNativeReleasePlan({ pm2Flags: { PM2_ENABLE_SITE: 'true' } });
  const reload = plan.find((item) => item.title === 'Start or reload PM2 services');
  assert.deepEqual(reload.args, ['startOrReload', 'ecosystem.config.cjs', '--update-env']);
  assert.equal(reload.env.PM2_ENABLE_SITE, 'true');
  assert.equal(plan.at(-1).env.PM2_ENABLE_SITE, 'true', 'the saved process list must match what was started');
});

test('PM2 flags follow the enabled profiles and the SSR site', () => {
  assert.deepEqual(derivePm2Flags(), { NODE_ENV: 'production' });
  assert.deepEqual(derivePm2Flags({ profiles: ['telegram', 'notification-consumer'], siteProcess: true }), {
    NODE_ENV: 'production',
    PM2_ENABLE_TELEGRAM: 'true',
    PM2_ENABLE_NOTIFICATIONS: 'true',
    PM2_ENABLE_SITE: 'true',
  });
});

test('the expected PM2 app set matches the enabled flags', () => {
  assert.deepEqual(expectedPm2Apps(derivePm2Flags()), ['admin-app-api', 'user-app-api', 'auth-app-api']);
  assert.deepEqual(expectedPm2Apps(derivePm2Flags({ profiles: ['discord'], siteProcess: true })), [
    'admin-app-api',
    'user-app-api',
    'auth-app-api',
    'discord-app-api',
    'site-app',
  ]);
  // A health check that only asserts "everything listed is online" passes when an
  // expected worker never started, so the expected set has to be explicit.
  assert.deepEqual(expectedPm2Apps(derivePm2Flags({ profiles: ['notification-scheduler'] })).slice(-2), [
    'notification-consumer',
    'notification-scheduler',
  ]);
});
