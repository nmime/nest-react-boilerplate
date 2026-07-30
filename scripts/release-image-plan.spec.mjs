// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
import {
  buildReleasePlan,
  loadSelectedReleaseClosure,
  releaseImages,
  selectReleaseImages,
} from './release-image-plan.mjs';

const jiti = createJiti(import.meta.url);
const { appCatalog } = await jiti.import('../packages/tooling/src/setup/catalog.ts');
const providerFree = ['landing-app'];
const postgres = ['auth-app-api', 'migrator', 'user-app-api'];
const mongodb = ['migrator', 'telegram-bot-api'];
const custom = ['landing-app', 'site-app'];

test('derives application release image ownership and metadata from the setup catalog', () => {
  const catalogImages = Object.values(appCatalog)
    .filter(({ releaseImage }) => releaseImage)
    .map(({ id }) => id);
  assert.deepEqual(
    releaseImages.filter(({ project }) => project).map(({ name }) => name),
    catalogImages,
  );
  assert.equal(
    releaseImages.find(({ name }) => name === 'auth-app-api').buildArgs,
    'NX_PROJECT=auth-app-api\nBUILD_OUTPUT=dist/apps/backend/auth/auth-app-api\nPNPM_VERSION=11.15.1',
  );
});

test('intersects Nx-affected images with a provider-free selected closure', () => {
  const selected = selectReleaseImages({
    selectedReleaseImages: providerFree,
    affectedProjects: ['landing-app', 'auth-app-api'],
  });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['landing-app'],
  );
});

test('force-full returns every selected PostgreSQL image and never every catalog image', () => {
  const selected = selectReleaseImages({ selectedReleaseImages: postgres, forceFull: true });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['migrator', 'user-app-api', 'auth-app-api'],
  );
  assert.ok(selected.length < releaseImages.length);
});

test('global inputs return every selected MongoDB image and no unselected image', () => {
  const selected = selectReleaseImages({ selectedReleaseImages: mongodb, changedFiles: ['Dockerfile'] });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['migrator', 'telegram-bot-api'],
  );
});

test('custom selections exclude affected and migration images outside the closure', () => {
  const selected = selectReleaseImages({
    selectedReleaseImages: custom,
    affectedProjects: ['site-app', 'user-app'],
    changedFiles: ['libs/backend/postgres/example/migrations/Migration.ts'],
  });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['site-app'],
  );
});

test('includes the selected migration image for migration inputs without rebuilding selected apps', () => {
  const selected = selectReleaseImages({
    selectedReleaseImages: postgres,
    changedFiles: ['libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/migrations/Migration.ts'],
  });
  assert.deepEqual(
    selected.map(({ name }) => name),
    ['migrator'],
  );
});

test('treats the complete PostgreSQL, MongoDB, and database-tooling source closures as migrator inputs', () => {
  for (const changedFile of [
    'libs/backend/postgres/main/shared/lib/src/postgres.module.ts',
    'libs/backend/mongodb/main/shared/lib/src/mongo.module.ts',
    'packages/tooling/src/commands/db/mongo-migrate.ts',
  ]) {
    const selected = selectReleaseImages({ selectedReleaseImages: postgres, changedFiles: [changedFile] }).map(
      ({ name }) => name,
    );
    assert.ok(selected.includes('migrator'), changedFile);
    assert.ok(
      selected.every((name) => postgres.includes(name)),
      changedFile,
    );
  }
});

test('rejects absent selection input and unknown closure images', () => {
  assert.throws(() => selectReleaseImages({ affectedProjects: ['auth-app-api'] }), /releaseImages are required/u);
  assert.throws(
    () => selectReleaseImages({ selectedReleaseImages: ['unknown-app'], forceFull: true }),
    /unknown release images: unknown-app/u,
  );
});

test('fails closed when the selected closure is missing or stale', async () => {
  await assert.rejects(
    loadSelectedReleaseClosure('/workspace', {
      readActual: () => {
        throw new Error('.nrb/closure.json is missing');
      },
    }),
    /closure.json is missing/u,
  );

  const actual = { releaseImages: providerFree, graphDigest: 'actual' };
  const expected = { releaseImages: providerFree, graphDigest: 'expected' };
  await assert.rejects(
    loadSelectedReleaseClosure('/workspace', {
      readActual: () => actual,
      buildExpected: async () => expected,
      checkArtifacts: () => ({ valid: true, problems: [], lockStatus: 'missing' }),
    }),
    /live graph digest is stale/u,
  );
});

test('rejects stale selected lock metadata on product release paths', async () => {
  const closure = { releaseImages: postgres, graphDigest: 'current' };
  await assert.rejects(
    loadSelectedReleaseClosure('/workspace', {
      readActual: () => closure,
      buildExpected: async () => closure,
      checkArtifacts: () => ({ valid: true, problems: [], lockStatus: 'stale' }),
    }),
    /pnpm-lock.yaml is stale/u,
  );
});

test('serializes only selected affected images to a GitHub matrix without project metadata', () => {
  const plan = buildReleasePlan({
    selectedReleaseImages: custom,
    affectedProjects: ['site-app', 'auth-app-api'],
    changedFiles: [],
    forceFull: false,
  });
  assert.equal(plan.hasImages, true);
  assert.deepEqual(plan.matrix.include, [
    {
      name: 'site-app',
      target: 'site-runtime',
      buildArgs: 'NX_PROJECT=site-app\nPNPM_VERSION=11.15.1',
    },
  ]);
});
