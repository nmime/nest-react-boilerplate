// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import test from 'node:test';
import { bakeNameForComposeService, planImageBuild, publishedImageRef } from './build-images.mjs';
import { imageCompileRequested } from './image-compile.mjs';
import { releaseImages } from './release-image-plan.mjs';

const closureContext = '.nrb/closure';

test('Bake is the only compile: every release image is a tagged bake target', () => {
  const plan = planImageBuild({
    names: releaseImages.map((image) => image.name),
    closureContext,
  });
  assert.deepEqual(plan.args.slice(0, 4), ['buildx', 'bake', '-f', 'docker-bake.json']);
  assert.ok(plan.args.includes('--load'));
  for (const image of releaseImages) {
    assert.ok(plan.config.target[image.name], image.name);
    assert.ok(plan.config.target[image.name].tags.includes(`nrb/${image.name}:local`));
    if (image.project) {
      assert.ok(plan.config.target[image.name].args.NX_BUILD_PROJECTS);
    }
  }
});

test('application images share one NX_BUILD_PROJECTS union', () => {
  const names = ['auth-app-api', 'user-app', 'migrator'];
  const plan = planImageBuild({ names, closureContext });
  assert.equal(plan.config.target['auth-app-api'].args.NX_BUILD_PROJECTS, 'auth-app-api,user-app');
  assert.equal(plan.config.target.migrator.args.NX_BUILD_PROJECTS, undefined);
});

test('production tags are added next to the local load tag', () => {
  const plan = planImageBuild({
    names: ['migrator'],
    closureContext,
    registry: 'ghcr.io/acme/acme',
    tag: 'sha-0123456789abcdef0123456789abcdef01234567',
  });
  assert.deepEqual(plan.config.target.migrator.tags, [
    'nrb/migrator:local',
    publishedImageRef('migrator', 'ghcr.io/acme/acme', 'sha-0123456789abcdef0123456789abcdef01234567'),
  ]);
});

test('image compile is off unless NRB_IMAGE_COMPILE is set', () => {
  assert.equal(imageCompileRequested({}), false);
  assert.equal(imageCompileRequested({ NRB_IMAGE_COMPILE: '0' }), false);
  assert.equal(imageCompileRequested({ NRB_IMAGE_COMPILE: '1' }), true);
});

test('compose service names map onto bake targets', () => {
  assert.equal(bakeNameForComposeService('migrate'), 'migrator');
  assert.equal(bakeNameForComposeService('mongodb-migrate'), 'migrator');
  assert.equal(bakeNameForComposeService('auth-app-api'), 'auth-app-api');
});

test('Dockerfile builder compile is independent of per-image RUNTIME_PROJECT', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dockerfile = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'Dockerfile'), 'utf8');
  const builder = dockerfile.match(/FROM workspace AS builder[\s\S]*?(?=FROM )/u)?.[0];
  assert.ok(builder, 'builder stage');
  assert.doesNotMatch(builder, /^\s*ARG RUNTIME_PROJECT/mu);
  assert.doesNotMatch(builder, /\$RUNTIME_PROJECT/u);
  assert.match(builder, /PROJECTS="\$\{NX_BUILD_PROJECTS:-\$NX_PROJECT\}"/u);
  assert.match(dockerfile, /FROM builder AS backend-deps[\s\S]*^ARG RUNTIME_PROJECT/mu);
  assert.match(
    dockerfile,
    /FROM nginxinc\/nginx-unprivileged[\s\S]*^ARG RUNTIME_PROJECT[\s\S]*PROJECT="\$\{RUNTIME_PROJECT:-\$NX_PROJECT\}"/mu,
  );
});
