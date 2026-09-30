// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('frontend proxy trust defaults to empty and accepts only explicit safe CIDR entries', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-proxy-trust-'));
  const destination = join(directory, 'trusted.conf');
  try {
    for (const value of [
      '',
      '127.0.0.1/32,10.23.0.0/24 ::1/128',
      '0.0.0.0/0',
      '::/0',
      '127.0.0.1/33',
      '256.0.0.1/32',
      '::1/129',
      '10.0.0.1',
      '10.0.0.1/32;include /private/file;',
    ]) {
      writeFileSync(destination, 'previous-owned-policy\n');
      const result = spawnSync('sh', [new URL('../docker/frontend-proxy-trust.sh', import.meta.url).pathname], {
        encoding: 'utf8',
        env: { ...process.env, FRONTEND_PROXY_TRUST_PATH: destination, FRONTEND_TRUSTED_PROXY_CIDRS: value },
      });
      const valid = value === '' || value.startsWith('127.0.0.1/32,');
      assert.equal(result.status, valid ? 0 : 1, `${value}: ${result.stderr}`);
      const output = readFileSync(destination, 'utf8');
      if (!valid) assert.equal(output, 'previous-owned-policy\n', 'failed validation preserves the prior file');
      else if (value) assert.equal(output, '127.0.0.1/32 1;\n10.23.0.0/24 1;\n::1/128 1;\n');
      else assert.equal(output, '\n', 'no sender is implicitly trusted');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('proxy source addresses never enter browser-visible runtime configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-public-runtime-'));
  const destination = join(directory, 'runtime-config.js');
  writeFileSync(destination, '');
  try {
    const result = spawnSync('sh', [new URL('../docker/frontend-runtime-config.sh', import.meta.url).pathname], {
      encoding: 'utf8',
      env: { ...process.env, FRONTEND_RUNTIME_CONFIG_PATH: destination, FRONTEND_TRUSTED_PROXY_CIDRS: '10.23.0.0/24' },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(destination, 'utf8');
    assert.ok(!output.includes('10.23.0.0/24'));
    assert.ok(!output.includes('FRONTEND_TRUSTED_PROXY_CIDRS'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
