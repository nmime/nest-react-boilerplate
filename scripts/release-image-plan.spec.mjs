import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReleasePlan, releaseImages, selectReleaseImages } from './release-image-plan.mjs';

test('selects only Nx-affected application images', () => {
  const selected = selectReleaseImages({ affectedProjects: ['auth-app-api', 'user-app'] });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['auth-app-api', 'user-app'],
  );
});

test('includes the migration image for migration inputs without rebuilding unrelated applications', () => {
  const selected = selectReleaseImages({
    changedFiles: ['libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/migrations/Migration.ts'],
  });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['migrator'],
  );
});

test('forces every image for Docker, workspace, and explicit full-release inputs', () => {
  const expected = releaseImages.map(({ name }) => name);
  assert.deepEqual(
    selectReleaseImages({ changedFiles: ['Dockerfile'] }).map(({ name }) => name),
    expected,
  );
  assert.deepEqual(
    selectReleaseImages({ forceFull: true }).map(({ name }) => name),
    expected,
  );
});

test('serializes the selected images to a GitHub matrix without internal project metadata', () => {
  const plan = buildReleasePlan({ affectedProjects: ['site-app'], changedFiles: [], forceFull: false });
  assert.equal(plan.hasImages, true);
  assert.deepEqual(plan.matrix.include, [
    {
      name: 'site-app',
      target: 'site-runtime',
      buildArgs: 'NX_PROJECT=site-app\nPNPM_VERSION=11.15.1',
    },
  ]);
});
