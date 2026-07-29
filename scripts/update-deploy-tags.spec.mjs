import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)));
const sha = '0123456789abcdef0123456789abcdef01234567';
const nextSha = '89abcdef0123456789abcdef0123456789abcdef';
const images = [
  'migrator',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'notification-scheduler',
  'notification-consumer',
  'admin-app',
  'user-app',
  'landing-app',
  'site-app',
  'mobile-app',
];
const digest = (character) => `sha256:${character.repeat(64)}`;
const selectedArgs = (names) => names.flatMap((name) => ['--selected-image', name]);
const imageArgs = (names, value) => names.flatMap((name) => ['--image', `${name}=${value}`]);

function execute(args) {
  return spawnSync('python3', ['scripts/update-deploy-tags.py', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

function run(args) {
  const result = execute(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function imageBlock(content, name) {
  return content.match(new RegExp(`repository: [^\\n]+/${name}\\n[\\s\\S]*?(?=\\n\\s+repository:|$)`, 'u'))?.[0] ?? '';
}

function appKey(image) {
  return image.replace(/-([a-z])/gu, (_, character) => character.toUpperCase());
}

function writeValuesFixture(directory, enabledImages) {
  const baseValuesFile = join(directory, 'values.yaml');
  const valuesFile = join(directory, 'values-production.yaml');
  const selectionValuesFile = join(directory, 'helm-values.yaml');
  const apps = images.filter((image) => image !== 'migrator');
  writeFileSync(
    baseValuesFile,
    [
      'migrations:',
      '  enabled: false',
      '  image:',
      '    repository: registry.example/product/migrator',
      'apps:',
      ...apps.flatMap((image) => [
        `  ${appKey(image)}:`,
        '    enabled: false',
        '    image:',
        `      repository: registry.example/product/${image}`,
      ]),
      '',
    ].join('\n'),
  );
  writeFileSync(
    valuesFile,
    [
      'migrations:',
      '  image:',
      '    repository: registry.example/product/migrator',
      '    tag: sha-REPLACE_WITH_RELEASE_GIT_SHA',
      "    digest: ''",
      'apps:',
      ...apps.flatMap((image) => [
        `  ${appKey(image)}:`,
        '    image:',
        `      repository: registry.example/product/${image}`,
        '      tag: sha-REPLACE_WITH_RELEASE_GIT_SHA',
        "      digest: ''",
      ]),
      '',
    ].join('\n'),
  );
  const enabled = new Set(enabledImages);
  writeFileSync(
    selectionValuesFile,
    [
      'migrations:',
      `  enabled: ${enabled.has('migrator')}`,
      'apps:',
      ...apps.flatMap((image) => [`  ${appKey(image)}:`, `    enabled: ${enabled.has(image)}`]),
      '',
    ].join('\n'),
  );
  return {
    valuesFile,
    args: [
      '--base-values-file',
      baseValuesFile,
      '--values-file',
      valuesFile,
      '--selection-values-file',
      selectionValuesFile,
    ],
  };
}

const initialPromotionShapes = [
  { name: 'provider-free initial promotion', selected: ['landing-app'] },
  { name: 'custom initial promotion', selected: ['discord-app-api', 'landing-app', 'site-app'] },
  { name: 'PostgreSQL initial promotion', selected: ['auth-app-api', 'migrator', 'user-app-api'] },
  { name: 'MongoDB initial promotion', selected: ['migrator', 'notification-consumer', 'user-app-api'] },
];

for (const shape of initialPromotionShapes) {
  test(`requires only fresh selected and enabled digests for ${shape.name}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-deploy-tags-'));
    const fixture = writeValuesFixture(directory, shape.selected);
    try {
      const required = run([sha, ...fixture.args, ...selectedArgs(shape.selected), '--print-required'])
        .stdout.trim()
        .split('\n');
      assert.deepEqual(required, [...shape.selected].sort());

      run([sha, ...fixture.args, ...selectedArgs(shape.selected), ...imageArgs(shape.selected, digest('a'))]);
      const promoted = readFileSync(fixture.valuesFile, 'utf8');
      for (const image of shape.selected) {
        const block = imageBlock(promoted, image);
        assert.ok(block.includes(`tag: "sha-${sha}"`), image);
        assert.ok(block.includes(`digest: "${digest('a')}"`), image);
      }
      assert.ok(promoted.includes('sha-REPLACE_WITH_RELEASE_GIT_SHA'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('rejects a missing selected and enabled digest on initial and later promotion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-deploy-tags-missing-'));
  const selected = ['landing-app', 'user-app'];
  const fixture = writeValuesFixture(directory, selected);
  try {
    const initial = execute([
      sha,
      ...fixture.args,
      ...selectedArgs(selected),
      ...imageArgs(['landing-app'], digest('a')),
    ]);
    assert.notEqual(initial.status, 0);
    assert.match(initial.stderr, /missing immutable digests.*user-app/u);

    run([sha, ...fixture.args, ...selectedArgs(selected), ...imageArgs(selected, digest('a'))]);
    const later = execute([
      nextSha,
      ...fixture.args,
      ...selectedArgs(selected),
      ...imageArgs(['landing-app'], digest('b')),
    ]);
    assert.notEqual(later.status, 0);
    assert.match(later.stderr, /missing immutable digests.*user-app/u);

    run([nextSha, ...fixture.args, ...selectedArgs(selected), ...imageArgs(selected, digest('b'))]);
    const promoted = readFileSync(fixture.valuesFile, 'utf8');
    for (const image of selected) {
      const block = imageBlock(promoted, image);
      assert.ok(block.includes(`tag: "sha-${nextSha}"`), image);
      assert.ok(block.includes(`digest: "${digest('b')}"`), image);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects digests outside selected and enabled deployment ownership', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-deploy-tags-extra-'));
  const fixture = writeValuesFixture(directory, ['landing-app']);
  try {
    const result = execute([
      sha,
      ...fixture.args,
      ...selectedArgs(['discord-app-api', 'landing-app']),
      ...imageArgs(['discord-app-api', 'landing-app'], digest('a')),
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside selected and enabled deployment ownership: discord-app-api/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
