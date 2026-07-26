// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBakeConfig } from './generate-bake-file.mjs';
import { releaseImages } from './release-image-plan.mjs';

test('every release image becomes a bake target with its docker stage', () => {
  const { target } = buildBakeConfig(releaseImages);
  for (const image of releaseImages) {
    assert.ok(target[image.name], `missing bake target ${image.name}`);
    assert.equal(target[image.name].target, image.target);
    assert.equal(target[image.name].dockerfile, 'Dockerfile');
  }
});

test('the default group builds exactly the release image set', () => {
  const { group } = buildBakeConfig(releaseImages);
  assert.deepEqual([...group.default.targets].sort(), releaseImages.map((image) => image.name).sort());
});

test('application images share one NX_BUILD_PROJECTS arg = union of projects', () => {
  const { target } = buildBakeConfig(releaseImages);
  const expected = releaseImages
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');
  const appTargets = releaseImages.filter((image) => image.project);
  for (const image of appTargets) {
    assert.equal(target[image.name].args.NX_BUILD_PROJECTS, expected);
  }
});

test('migrator target carries no NX_BUILD_PROJECTS (does not need the build stage)', () => {
  const { target } = buildBakeConfig(releaseImages);
  assert.equal(target.migrator.args.NX_BUILD_PROJECTS, undefined);
});

test('per-image slice args are preserved from buildArgs (BUILD_OUTPUT / FRONTEND_OUTPUT)', () => {
  const { target } = buildBakeConfig(releaseImages);
  assert.equal(target['auth-app-api'].args.BUILD_OUTPUT, 'dist/apps/backend/auth/auth-app-api');
  assert.equal(target['admin-app'].args.FRONTEND_OUTPUT, 'dist/apps/frontend/admin');
});

test('buildBakeConfig can restrict the default group to selected image names', () => {
  const { group, target } = buildBakeConfig(releaseImages, ['auth-app-api', 'migrator']);
  assert.deepEqual([...group.default.targets].sort(), ['auth-app-api', 'migrator']);
  assert.ok(target['auth-app-api'] && target.migrator);
  assert.equal(target['auth-app-api'].args.NX_BUILD_PROJECTS, 'auth-app-api');
});
