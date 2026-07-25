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
const productionValues = readFileSync(join(rootDir, '.helm/values-production.yaml'), 'utf8');
const digest = (character) => `sha256:${character.repeat(64)}`;
const sha = '0123456789abcdef0123456789abcdef01234567';
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
