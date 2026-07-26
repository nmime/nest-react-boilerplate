// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultIgnore } from './runtime-utils';

test('defaultIgnore excludes generated verification reports', () => {
  assert.equal(defaultIgnore('cucumber-report/index.html'), true);
  assert.equal(defaultIgnore('test-results/cucumber/messages.ndjson'), true);
  assert.equal(defaultIgnore('apps/e2e/acceptance/features/assurance.feature'), false);
});
