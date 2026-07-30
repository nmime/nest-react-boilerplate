// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { releaseImages } from './release-image-plan.mjs';
import {
  parseImageUpdate,
  promotableImageNames,
  promoteImageDigests,
  releasePlaceholder,
  renderPromotionPreview,
  updateImageBlock,
} from './update-deploy-tags.mjs';

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
    rmSync(directory, { force: true, recursive: true });
  }
});

const productionValues = readFileSync(join(rootDir, '.helm/values-production.yaml'), 'utf8');
const everyImage = promotableImageNames.map((name) => ({ name, digest: digest('a') }));

test('promotable images are the authoritative release inventory, not a second list', () => {
  assert.deepEqual(
    promotableImageNames,
    releaseImages.map(({ name }) => name),
    'a hand-maintained copy would drift from what the release pipeline builds',
  );
});

test('the first promotion must cover every release image', () => {
  // A leftover placeholder would deploy a workload with an unresolved tag.
  assert.ok(productionValues.includes(releasePlaceholder), 'the checked-in values start as placeholders');
  assert.throws(
    () =>
      promoteImageDigests({ content: productionValues, sha, updates: [{ name: 'admin-app', digest: digest('b') }] }),
    /first promotion must supply every release image digest/u,
  );
  const { content, tag } = promoteImageDigests({ content: productionValues, sha, updates: everyImage });
  assert.equal(tag, `sha-${sha}`);
  assert.ok(!content.includes(releasePlaceholder));
  assert.ok(content.includes(`tag: "sha-${sha}"`));
  assert.ok(content.includes(`digest: "${digest('a')}"`));
});

test('a later promotion leaves unaffected workload digests untouched', () => {
  const first = promoteImageDigests({ content: productionValues, sha, updates: everyImage }).content;
  const secondSha = '89abcdef0123456789abcdef0123456789abcdef';
  const { content } = promoteImageDigests({
    content: first,
    sha: secondSha,
    updates: [{ name: 'admin-app', digest: digest('b') }],
  });
  const block = (key) => content.match(new RegExp(`${key}:[\\s\\S]*?(?=\\n  [a-zA-Z]|$)`, 'u'))?.[0] ?? '';
  assert.ok(block('adminApp').includes(`tag: "sha-${secondSha}"`), 'the promoted image moves');
  assert.ok(block('adminApp').includes(`digest: "${digest('b')}"`));
  assert.ok(block('userApp').includes(`tag: "sha-${sha}"`), 'an unaffected image keeps its digest');
  assert.ok(block('userApp').includes(`digest: "${digest('a')}"`));
});

test('a promotion never leaks into the next workload block', () => {
  const promoted = promoteImageDigests({ content: productionValues, sha, updates: everyImage }).content;
  const content = updateImageBlock(promoted, { name: 'migrator', tag: 'sha-deadbeef', digest: digest('c') });
  assert.equal((content.match(new RegExp(digest('c'), 'gu')) ?? []).length, 1, 'exactly one digest is rewritten');
  assert.equal((content.match(/tag: "sha-deadbeef"/gu) ?? []).length, 1);
});

test('rejects anything that is not an immutable digest for a known image', () => {
  assert.throws(() => parseImageUpdate('admin-app=latest'), /invalid immutable digest/u);
  assert.throws(() => parseImageUpdate(`admin-app=sha256:${'a'.repeat(63)}`), /invalid immutable digest/u);
  assert.throws(() => parseImageUpdate(`not-an-image=${digest('a')}`), /--image must name one of/u);
  assert.throws(() => parseImageUpdate('admin-app'), /--image must name one of/u);
  assert.deepEqual(parseImageUpdate(`admin-app=${digest('A')}`), { name: 'admin-app', digest: digest('a') });
});

test('rejects a mutable or malformed release SHA and repeated images', () => {
  for (const invalid of ['main', 'sha-0123', '0123456789abcdef', `${sha}0`]) {
    assert.throws(
      () => promoteImageDigests({ content: productionValues, sha: invalid, updates: everyImage }),
      /Git SHA/u,
    );
  }
  assert.throws(
    () =>
      promoteImageDigests({
        content: productionValues,
        sha,
        updates: [...everyImage, { name: 'admin-app', digest: digest('b') }],
      }),
    /only once/u,
  );
});

test('renders a focused non-mutating promotion preview', () => {
  assert.equal(
    renderPromotionPreview('tag: old\ndigest: old\n', 'tag: new\ndigest: new\n'),
    [
      '--- current',
      '+++ promoted',
      '@@ line 1 @@',
      '- tag: old',
      '+ tag: new',
      '@@ line 2 @@',
      '- digest: old',
      '+ digest: new',
      '',
    ].join('\n'),
  );
  assert.equal(renderPromotionPreview('unchanged\n', 'unchanged\n'), '');
});

test('fails loudly when the values document has no such image block', () => {
  assert.throws(
    () =>
      updateImageBlock('image:\n  repository: ghcr.io/acme/other\n  tag: "x"\n  digest: "y"\n', {
        name: 'admin-app',
        tag: 'sha-x',
        digest: digest('a'),
      }),
    /do not contain an image repository ending in \/admin-app/u,
  );
  assert.throws(
    () =>
      updateImageBlock('  repository: ghcr.io/acme/admin-app\n  tag: "x"\n', {
        name: 'admin-app',
        tag: 'sha-x',
        digest: digest('a'),
      }),
    /must contain tag and digest fields/u,
  );
});

test('the CLI writes promotions and dry-run never mutates the values file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-deploy-tags-'));
  const valuesFile = join(directory, 'values-production.yaml');
  const imageArguments = everyImage.flatMap(({ name, digest: imageDigest }) => ['--image', `${name}=${imageDigest}`]);
  writeFileSync(valuesFile, productionValues);

  try {
    const dryRun = spawnSync(
      process.execPath,
      ['scripts/update-deploy-tags.mjs', sha, '--values-file', valuesFile, '--dry-run', ...imageArguments],
      { cwd: rootDir, encoding: 'utf8' },
    );
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.match(dryRun.stdout, /Dry run: WOULD update 13 image\(s\)/u);
    assert.match(dryRun.stdout, /--- current\n\+\+\+ promoted/u);
    assert.match(dryRun.stdout, /- \s+tag: sha-REPLACE_WITH_RELEASE_GIT_SHA/u);
    assert.match(dryRun.stdout, new RegExp(`\\+ \\s+tag: "sha-${sha}"`, 'u'));
    assert.equal(readFileSync(valuesFile, 'utf8'), productionValues);

    const apply = spawnSync(
      process.execPath,
      ['scripts/update-deploy-tags.mjs', sha, '--values-file', valuesFile, ...imageArguments],
      { cwd: rootDir, encoding: 'utf8' },
    );
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);
    const promoted = readFileSync(valuesFile, 'utf8');
    assert.ok(!promoted.includes(releasePlaceholder));
    assert.ok(promoted.includes(`tag: "sha-${sha}"`));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
