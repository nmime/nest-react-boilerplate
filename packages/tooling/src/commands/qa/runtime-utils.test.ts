// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandExists, defaultIgnore } from './runtime-utils';

test('defaultIgnore excludes generated verification reports', () => {
  assert.equal(defaultIgnore('cucumber-report/index.html'), true);
  assert.equal(defaultIgnore('test-results/cucumber/messages.ndjson'), true);
  assert.equal(defaultIgnore('apps/e2e/acceptance/features/assurance.feature'), false);
});

test('commandExists performs a PATH lookup without interpreting shell syntax', () => {
  assert.equal(commandExists('node'), true);
  assert.equal(commandExists('node; exit 0'), false);
});
