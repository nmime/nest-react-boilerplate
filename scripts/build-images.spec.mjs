// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import test from 'node:test';
import { bakeNameForComposeService, imageBuildBatches, planImageBuild, publishedImageRef } from './build-images.mjs';
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

test('bounded image loads retain one complete compile plan and every selected image', () => {
  const names = ['auth-app-api', 'user-app-api', 'site-app', 'user-app', 'migrator'];
  const plan = planImageBuild({ names, closureContext });
  const original = JSON.stringify(plan);
  const batches = imageBuildBatches(plan);
  assert.deepEqual(
    batches.map((args) => args.slice(5)),
    [names.slice(0, 2), names.slice(2, 4), names.slice(4)],
  );
  assert.deepEqual(
    batches.flatMap((args) => args.slice(5)),
    names,
  );
  for (const args of batches)
    assert.deepEqual(args.slice(0, 5), ['buildx', 'bake', '-f', 'docker-bake.json', '--load']);
  assert.equal(
    plan.config.target['auth-app-api'].args.NX_BUILD_PROJECTS,
    'auth-app-api,user-app-api,site-app,user-app',
  );
  assert.equal(
    plan.config.target['site-app'].args.NX_BUILD_PROJECTS,
    plan.config.target['auth-app-api'].args.NX_BUILD_PROJECTS,
  );
  assert.equal(JSON.stringify(plan), original);
  assert.equal(imageBuildBatches(plan, 1).length, names.length);
  assert.equal(imageBuildBatches(plan, 99).length, 1);
  for (const invalid of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => imageBuildBatches(plan, invalid), /positive safe integer/u);
  }
  assert.throws(() => imageBuildBatches({ names: [], args: [] }), /selected image/u);
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
  const workspace = dockerfile.match(/FROM node:[\s\S]*? AS workspace[\s\S]*?(?=\nFROM )/u)?.[0];
  assert.ok(workspace, 'workspace stage');
  const install = workspace.indexOf('pnpm install --frozen-lockfile --offline');
  const canonicalMetadata = workspace.indexOf('COPY package.json ./package.json');
  const linkSource = workspace.indexOf('deployment-artifact.ts link-source-dependencies');
  assert.ok(install >= 0 && canonicalMetadata > install && linkSource > canonicalMetadata);
  assert.doesNotMatch(workspace.slice(canonicalMetadata), /pnpm (install|fetch)/u);
  assert.match(dockerfile, /FROM builder AS backend-deps[\s\S]*^ARG RUNTIME_PROJECT/mu);
  assert.match(
    dockerfile,
    /FROM nginxinc\/nginx-unprivileged[\s\S]*^ARG RUNTIME_PROJECT[\s\S]*PROJECT="\$\{RUNTIME_PROJECT:-\$NX_PROJECT\}"/mu,
  );
});
