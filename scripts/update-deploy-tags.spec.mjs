import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)));
const images = [
  'migrator',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'admin-app',
  'user-app',
  'landing-app',
  'site-app',
  'mobile-app',
];
const digest = (character) => `sha256:${character.repeat(64)}`;
const imageArgs = (updates) => updates.flatMap(([name, value]) => ['--image', `${name}=${value}`]);
const run = (args) => {
  const result = spawnSync('python3', ['scripts/update-deploy-tags.py', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

test('requires a complete first promotion and preserves unaffected image digests afterwards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-deploy-tags-'));
  const valuesFile = join(directory, 'values-production.yaml');
  writeFileSync(valuesFile, readFileSync(join(rootDir, '.helm/values-production.yaml'), 'utf8'));
  try {
    const firstSha = '0123456789abcdef0123456789abcdef01234567';
    run([firstSha, '--values-file', valuesFile, ...imageArgs(images.map((name) => [name, digest('a')]))]);
    const firstPromotion = readFileSync(valuesFile, 'utf8');
    assert.ok(!firstPromotion.includes('sha-REPLACE_WITH_RELEASE_GIT_SHA'));
    assert.ok(firstPromotion.includes(`tag: "sha-${firstSha}"`));
    assert.ok(firstPromotion.includes(`digest: "${digest('a')}"`));

    const secondSha = '89abcdef0123456789abcdef0123456789abcdef';
    run([secondSha, '--values-file', valuesFile, ...imageArgs([['admin-app', digest('b')]])]);
    const selectivePromotion = readFileSync(valuesFile, 'utf8');
    const adminBlock = selectivePromotion.match(/adminApp:[\s\S]*?(?=\n  [a-zA-Z]|$)/u)?.[0] ?? '';
    const userBlock = selectivePromotion.match(/userApp:[\s\S]*?(?=\n  [a-zA-Z]|$)/u)?.[0] ?? '';
    assert.ok(adminBlock.includes(`tag: "sha-${secondSha}"`));
    assert.ok(adminBlock.includes(`digest: "${digest('b')}"`));
    assert.ok(userBlock.includes(`tag: "sha-${firstSha}"`));
    assert.ok(userBlock.includes(`digest: "${digest('a')}"`));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
