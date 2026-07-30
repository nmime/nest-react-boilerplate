// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boundedInteger,
  disallowedRequiredSkips,
  parseCommandArgv,
  unknownWorldClassGates,
} from './world-class-policy';

describe('world-class focused gate policy', () => {
  it('does not fail a focused CI run for gates that were intentionally not selected', () => {
    const skipped = [
      { name: 'load-stress-soak', reason: 'not selected' },
      { name: 'observability', reason: 'not selected' },
    ];

    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(['reliability-smoke']),
        skipped,
      }),
      [],
    );
  });

  it('keeps a selected or full-suite required skip fail-closed in CI', () => {
    const selectedSkip = [{ name: 'reliability-smoke', reason: 'runtime unavailable' }];

    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(['reliability-smoke']),
        skipped: selectedSkip,
      }),
      selectedSkip,
    );
    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(),
        skipped: selectedSkip,
      }),
      selectedSkip,
    );
  });

  it('rejects unknown focused gate names instead of producing an empty pass', () => {
    assert.deepEqual(
      unknownWorldClassGates(new Set(['reliability-smoke', 'reliabilty-smoke'])),
      ['reliabilty-smoke'],
    );
  });

  it('accepts only shell-free JSON command argv', () => {
    assert.deepEqual(
      parseCommandArgv('["pnpm","run","test:fullstack"]', 'QA_USER_JOURNEY_COMMAND'),
      ['pnpm', 'run', 'test:fullstack'],
    );
    assert.throws(
      () => parseCommandArgv('pnpm run test:fullstack', 'QA_USER_JOURNEY_COMMAND'),
      /JSON array/u,
    );
    assert.throws(
      () => parseCommandArgv('["pnpm",""]', 'QA_USER_JOURNEY_COMMAND'),
      /non-empty strings/u,
    );
  });

  it('caps resource-sensitive integer settings', () => {
    assert.equal(
      boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32 }),
      16,
    );
    assert.equal(
      boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32, value: '32' }),
      32,
    );
    assert.throws(
      () => boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32, value: '33' }),
      /between 1 and 32/u,
    );
  });
});
