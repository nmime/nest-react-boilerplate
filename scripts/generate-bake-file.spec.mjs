import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { normalizedClosureContextFiles, resolveSelectedProductClosureContext } from './closure-build-context.mjs';
import { buildBakeConfig, resolveBakeImageNames } from './generate-bake-file.mjs';
import { releaseImages } from './release-image-plan.mjs';

const productContext = '.nrb/closure';

test('every release image becomes a bake target with its docker stage', () => {
  const { target } = buildBakeConfig(releaseImages, undefined, productContext);
  for (const image of releaseImages) {
    assert.ok(target[image.name], `missing bake target ${image.name}`);
    assert.equal(target[image.name].target, image.target);
    assert.equal(target[image.name].dockerfile, 'Dockerfile');
    assert.deepEqual(target[image.name].contexts, { 'nrb-closure': productContext });
  }
});

test('the default group builds exactly the release image set', () => {
  const { group } = buildBakeConfig(releaseImages, undefined, productContext);
  assert.deepEqual([...group.default.targets].sort(), releaseImages.map((image) => image.name).sort());
});

test('application images share one NX_BUILD_PROJECTS arg = union of projects', () => {
  const { target } = buildBakeConfig(releaseImages, undefined, productContext);
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
  const { target } = buildBakeConfig(releaseImages, undefined, productContext);
  assert.equal(target.migrator.args.NX_BUILD_PROJECTS, undefined);
});

test('per-image slice args are preserved from buildArgs (BUILD_OUTPUT / FRONTEND_OUTPUT)', () => {
  const { target } = buildBakeConfig(releaseImages, undefined, productContext);
  assert.equal(target['auth-app-api'].args.BUILD_OUTPUT, 'dist/apps/backend/auth/auth-app-api');
  assert.equal(target['auth-app-api'].args.RUNTIME_PROJECT, 'auth-app-api');
  assert.equal(target['admin-app'].args.FRONTEND_OUTPUT, 'dist/apps/frontend/admin');
  assert.equal(target['site-app'].args.RUNTIME_PROJECT, 'site-app');
});

test('buildBakeConfig restricts the default group to selected closure image names', () => {
  const { group, target } = buildBakeConfig(releaseImages, ['auth-app-api', 'migrator'], productContext);
  assert.deepEqual([...group.default.targets].sort(), ['auth-app-api', 'migrator']);
  assert.ok(target['auth-app-api'] && target.migrator);
  assert.equal(target['auth-app-api'].args.NX_BUILD_PROJECTS, 'auth-app-api');
  assert.equal(target['auth-app-api'].args.RUNTIME_PROJECT, 'auth-app-api');
});

test('an explicit empty selected closure never falls back to all catalog images', () => {
  const { group, target } = buildBakeConfig(releaseImages, [], productContext);
  assert.deepEqual(group.default.targets, []);
  assert.deepEqual(target, {});
});

test('unknown selected image names fail instead of being silently dropped', () => {
  assert.throws(() => buildBakeConfig(releaseImages, ['auth-app-api', 'unknown-app'], productContext), /unknown-app/u);
});

test('Bake config refuses to infer nrb-closure from the default source context', () => {
  assert.throws(() => buildBakeConfig(releaseImages, ['user-app-api']), /explicit nrb-closure/u);
});

test('Bake --only can reduce but never escape selected releaseImages', () => {
  assert.deepEqual(resolveBakeImageNames(['auth-app-api', 'migrator'], 'migrator'), ['migrator']);
  assert.throws(
    () => resolveBakeImageNames(['auth-app-api', 'migrator'], 'auth-app-api,user-app-api'),
    /outside the selected closure: user-app-api/u,
  );
});

test('all-reference Bake targets use the isolated provider closure context', () => {
  const context = '.nrb/reference/mongodb';
  const { target } = buildBakeConfig(releaseImages, ['user-app-api', 'migrator'], context);
  assert.deepEqual(target['user-app-api'].contexts, { 'nrb-closure': context });
  assert.deepEqual(target.migrator.contexts, { 'nrb-closure': context });
});

test('product Bake targets use only the normalized selected product context', () => {
  const { target } = buildBakeConfig(releaseImages, ['user-app-api'], productContext);
  assert.deepEqual(target['user-app-api'].contexts, { 'nrb-closure': productContext });
});

test('normalized product context rejects the default workspace and stale source copies', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'nrb-bake-context-'));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  const closureRoot = join(root, '.nrb/closure');
  mkdirSync(closureRoot, { recursive: true });
  mkdirSync(join(root, '.nrb'), { recursive: true });
  for (const file of normalizedClosureContextFiles) writeFileSync(join(closureRoot, file), `${file}\n`);
  writeFileSync(join(root, '.nrb/closure.json'), 'closure.json\n');
  writeFileSync(join(root, 'nrb.config.json'), 'nrb.config.json\n');
  writeFileSync(join(root, '.nrb/workspace.json'), 'workspace.json\n');

  assert.equal(resolveSelectedProductClosureContext(root), closureRoot);
  assert.throws(() => resolveSelectedProductClosureContext(root, '.'), /normalized selected context/u);
  writeFileSync(join(root, '.nrb/closure.json'), 'stale\n');
  assert.throws(() => resolveSelectedProductClosureContext(root), /context is stale/u);
});

const buildxAvailable = spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status === 0;
test(
  'resolved Buildx Bake plan keeps nrb-closure distinct from the default context',
  { skip: !buildxAvailable },
  (context) => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-bake-print-'));
    context.after(() => rmSync(root, { force: true, recursive: true }));
    const namedContext = join(root, 'named-closure');
    mkdirSync(namedContext);
    const configPath = join(root, 'docker-bake.json');
    writeFileSync(
      configPath,
      `${JSON.stringify(buildBakeConfig(releaseImages, ['user-app-api'], namedContext), null, 2)}\n`,
    );
    const printed = spawnSync('docker', ['buildx', 'bake', '--print', '-f', configPath, 'user-app-api'], {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
    });
    assert.equal(printed.status, 0, printed.stderr);
    const plan = JSON.parse(printed.stdout);
    assert.equal(plan.target['user-app-api'].contexts['nrb-closure'], namedContext);
    assert.notEqual(plan.target['user-app-api'].context, namedContext);
  },
);
