// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandExists, defaultIgnore, validateSchema } from './runtime-utils';
import type { OpenApiDocument, OpenApiSchema } from './runtime-utils';

const emptyDoc = { openapi: '3.1.0', info: { title: 'test', version: '1' }, paths: {} } as unknown as OpenApiDocument;
const schema = (value: Record<string, unknown>): OpenApiSchema => value as unknown as OpenApiSchema;

test('defaultIgnore excludes generated verification reports', () => {
  assert.equal(defaultIgnore('cucumber-report/index.html'), true);
  assert.equal(defaultIgnore('test-results/cucumber/messages.ndjson'), true);
  assert.equal(defaultIgnore('apps/e2e/acceptance/features/assurance.feature'), false);
});

test('commandExists performs a PATH lookup without interpreting shell syntax', () => {
  assert.equal(commandExists('node'), true);
  assert.equal(commandExists('node; exit 0'), false);
});

test('validateSchema rejects a body property the provider schema no longer declares', () => {
  // Deleting or renaming a response field is the most common breaking provider change, and
  // the consumer contract gate exists to catch it. Walking only declared keys cannot.
  const providerSchema = schema({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } });

  const errors = validateSchema({ id: 'u-1', email: 'contract@example.com' }, providerSchema, emptyDoc, '$');

  assert.deepEqual(errors, ['$.email: not declared by the provider schema']);
});

test('validateSchema reports every undeclared property, nested included', () => {
  const providerSchema = schema({
    type: 'object',
    properties: { profile: { type: 'object', properties: { id: { type: 'string' } } } },
  });

  const errors = validateSchema({ profile: { id: 'u-1', tenantId: 't-1' }, extra: 1 }, providerSchema, emptyDoc, '$');

  assert.deepEqual(errors.sort(), [
    '$.extra: not declared by the provider schema',
    '$.profile.tenantId: not declared by the provider schema',
  ]);
});

test('validateSchema accepts a body whose properties are all declared', () => {
  const providerSchema = schema({
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' }, email: { type: 'string', format: 'email' } },
  });

  assert.deepEqual(validateSchema({ id: 'u-1', email: 'contract@example.com' }, providerSchema, emptyDoc, '$'), []);
});

test('validateSchema leaves free-form and explicitly open objects permissive', () => {
  const freeForm = schema({ type: 'object' });
  const open = schema({ type: 'object', properties: { id: { type: 'string' } }, additionalProperties: true });
  const typedOpen = schema({
    type: 'object',
    properties: { id: { type: 'string' } },
    additionalProperties: { type: 'string' },
  });

  assert.deepEqual(validateSchema({ anything: 1 }, freeForm, emptyDoc, '$'), []);
  assert.deepEqual(validateSchema({ id: 'u-1', extra: 1 }, open, emptyDoc, '$'), []);
  assert.deepEqual(validateSchema({ id: 'u-1', extra: 'x' }, typedOpen, emptyDoc, '$'), []);
});
