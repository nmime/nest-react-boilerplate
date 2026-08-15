// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyContainerReadiness, composeStartupPlan, startupCommands } from './runtime-stack.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

describe('runtime stack readiness classification', () => {
  // The old shell asserted `status != 'exited' && status != 'running'`, so a one-shot still
  // running was neither pending nor failed and the whole stack was declared ready while the
  // migrator was mid-run. That is the race this classification exists to close.
  it('holds a one-shot that has not exited yet', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'none', status: 'running', exitCode: 0, oneShot: true }),
      'pending',
    );
  });

  it('accepts a one-shot that exited cleanly', () => {
    assert.equal(classifyContainerReadiness({ health: 'none', status: 'exited', exitCode: 0, oneShot: true }), 'ready');
  });

  it('fails a one-shot that exited non-zero', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'none', status: 'exited', exitCode: 1, oneShot: true }),
      'failed',
    );
  });

  // The trap in the obvious fix: notification-scheduler and notification-consumer are
  // long-running and declare no healthcheck. Reading "no healthcheck" as "one-shot" would
  // hold them as pending forever and hang every runtime lane until the timeout.
  it('accepts a long-running service that declares no healthcheck once it is running', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'none', status: 'running', exitCode: 0, oneShot: false }),
      'ready',
    );
  });

  it('fails a long-running service that died', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'none', status: 'exited', exitCode: 2, oneShot: false }),
      'failed',
    );
  });

  it('holds a service whose healthcheck is still starting', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'starting', status: 'running', exitCode: 0, oneShot: false }),
      'pending',
    );
  });

  it('accepts a healthy service and fails an unhealthy one', () => {
    assert.equal(
      classifyContainerReadiness({ health: 'healthy', status: 'running', exitCode: 0, oneShot: false }),
      'ready',
    );
    assert.equal(
      classifyContainerReadiness({ health: 'unhealthy', status: 'running', exitCode: 0, oneShot: false }),
      'failed',
    );
  });
});

describe('compose startup plan', () => {
  // Shaped like `docker compose config --format json` for the profiles a runtime lane pins.
  const postgresLane = {
    services: {
      postgres: { restart: 'unless-stopped' },
      redis: { restart: 'unless-stopped' },
      migrate: { restart: 'no', depends_on: { postgres: { condition: 'service_healthy' } } },
      'user-app-api': { restart: 'unless-stopped', depends_on: { postgres: { condition: 'service_healthy' } } },
    },
  };

  it('holds the migrator between its database and every application', () => {
    assert.deepEqual(composeStartupPlan(postgresLane), [
      { kind: 'up', services: ['postgres'], waitForHealthy: true },
      { kind: 'run', services: ['migrate'] },
      { kind: 'up', services: ['redis', 'user-app-api'] },
    ]);
  });

  it('orders one-shots that depend on each other, and gates on health only once it is reachable', () => {
    const mongodbLane = {
      services: {
        mongodb: { restart: 'unless-stopped' },
        'mongodb-migrate': {
          restart: 'no',
          depends_on: {
            mongodb: { condition: 'service_healthy' },
            'mongodb-init': { condition: 'service_completed_successfully' },
          },
        },
        'mongodb-init': { restart: 'no', depends_on: { mongodb: { condition: 'service_started' } } },
        'auth-app-api': { restart: 'unless-stopped' },
      },
    };

    // mongodb-init asks only for `service_started`, which is how it declares that it is what *makes*
    // its prerequisite healthy -- a `--replSet` mongod is not a writable primary until `rs.initiate()`
    // has run. Waiting for health before it would wait for a state only it can produce.
    assert.deepEqual(composeStartupPlan(mongodbLane), [
      { kind: 'up', services: ['mongodb'] },
      { kind: 'run', services: ['mongodb-init'] },
      { kind: 'up', services: ['mongodb'], waitForHealthy: true },
      { kind: 'run', services: ['mongodb-migrate'] },
      { kind: 'up', services: ['auth-app-api'] },
    ]);
  });

  it('starts everything in one step when nothing declares itself a one-shot', () => {
    const noPreparation = { services: { redis: { restart: 'unless-stopped' }, nats: { restart: 'unless-stopped' } } };

    assert.deepEqual(composeStartupPlan(noPreparation), [{ kind: 'up', services: ['redis', 'nats'] }]);
  });
});

describe('runtime stack startup commands', () => {
  const composeFile = 'docker/docker-compose.yml';

  // Without a selection there is nothing to sequence against, so the whole-stack start is still
  // the right behaviour -- but it must build, which the per-step `up --no-build` does not.
  it('starts without compiling images by default', () => {
    assert.deepEqual(startupCommands({ composeFile, plan: undefined }), [
      ['compose', '-f', composeFile, 'up', '-d', '--no-build'],
    ]);
  });

  it('compiles through Bake only when image compile is requested', () => {
    assert.deepEqual(startupCommands({ composeFile, plan: undefined, compile: true }), [
      ['scripts/build-images.mjs'],
      ['compose', '-f', composeFile, 'up', '-d', '--no-build'],
    ]);
  });

  it('runs each one-shot to completion between the database and the rest', () => {
    const plan = [
      { kind: 'up', services: ['postgres'], waitForHealthy: true },
      { kind: 'run', services: ['migrate'] },
      { kind: 'up', services: ['auth-app-api', 'user-app-api'] },
    ];

    assert.deepEqual(startupCommands({ composeFile, plan }), [
      ['compose', '-f', composeFile, 'up', '--no-build', '-d', '--wait', 'postgres'],
      ['compose', '-f', composeFile, 'run', '--rm', '--no-deps', 'migrate'],
      ['compose', '-f', composeFile, 'up', '--no-build', '-d', 'auth-app-api', 'user-app-api'],
    ]);
  });
});

describe('runtime stack drivers', () => {
  // The two drivers were byte-identical bash, and the shell header said so: "Change one, change
  // the other." A duplicated start sequence is what let the CI lanes keep the unsequenced `up -d`
  // after the Playwright driver was fixed.
  it('starts the stack from the shared implementation in both drivers', () => {
    for (const driver of ['.github/actions/runtime-stack/action.yml', 'scripts/ci/runtime-stack.sh']) {
      const source = read(driver);

      assert.ok(source.includes('scripts/ci/runtime-stack.mjs'), `${driver} does not delegate to the shared driver`);
      assert.ok(
        !/docker compose -f "\$COMPOSE_FILE_PATH" up -d --build/u.test(source),
        `${driver} still starts the whole stack in one unsequenced step`,
      );
    }
  });

  it('keeps the workflow contract pointed at the shared implementation', () => {
    const validator = read('scripts/validate-github-workflows.mjs');

    assert.ok(
      !validator.includes('docker compose -f "$COMPOSE_FILE_PATH" up -d --build'),
      'the workflow contract still pins the unsequenced start sequence',
    );
  });
});
