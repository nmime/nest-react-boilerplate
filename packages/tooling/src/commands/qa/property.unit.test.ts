// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { property, assert as assertProperty, string } from 'fast-check';
import { findOperation, matchPathTemplate, resolveJsonPointer } from './runtime-utils.ts';

describe('actual contract property helpers', () => {
  it('resolves arbitrary escaped component keys to their exact schema', () => {
    assertProperty(property(string(), (key) => {
      const target = {type: 'string'};
      const doc = {components: {schemas: {[key]: target}}};
      const token = key.replaceAll('~', '~0').replaceAll('/', '~1');
      return resolveJsonPointer(doc, `#/components/schemas/${token}`) === target;
    }), {numRuns: 100});
  });

  it('distinguishes literal escape sequences and rejects absent paths', () => {
    const slash = {type: 'string'}, literal = {type: 'integer'};
    const doc = {components: {schemas: {'a/b': slash, 'a~1b': literal}}};
    assert.equal(resolveJsonPointer(doc, '#/components/schemas/a~1b'), slash);
    assert.equal(resolveJsonPointer(doc, '#/components/schemas/a~01b'), literal);
    assert.equal(resolveJsonPointer(doc, '#/components/schemas/missing'), undefined);
    assert.equal(resolveJsonPointer(doc, 'https://example.com/schema'), undefined);
  });

  it('selects the declared operation while preserving route boundaries and HTTP methods', () => {
    const operation = {operationId: 'read-user'};
    const contract = {file: 'fixture.json', path: 'fixture.json', doc: {paths: {'/users/{id}': {get: operation}}}};
    assert.equal(findOperation(contract, 'GET', '/users/42')?.operation, operation);
    assert.equal(findOperation(contract, 'POST', '/users/42'), null);
    assert.equal(matchPathTemplate('/users/{id}', '/users/42/details'), null);
    assert.equal(matchPathTemplate('/users/{id}', '/not-users/42'), null);
  });
});
