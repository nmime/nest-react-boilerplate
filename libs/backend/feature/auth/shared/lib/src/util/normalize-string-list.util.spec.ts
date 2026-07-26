// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import { normalizeStringList } from './normalize-string-list.util';

describe(normalizeStringList.name, () => {
  it('normalizes strings and arrays into unique values', () => {
    expect(normalizeStringList('admin ops,profile:read admin')).toEqual(['admin', 'ops', 'profile:read']);
    expect(normalizeStringList([' admin ', '', 'ops', 'admin', 42])).toEqual(['admin', 'ops']);
    expect(normalizeStringList(null)).toEqual([]);
  });
});
