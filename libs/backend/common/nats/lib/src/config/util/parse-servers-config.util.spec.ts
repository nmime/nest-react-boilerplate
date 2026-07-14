import { describe, expect, it } from 'vitest';
import { parseServersConfig } from './parse-servers-config.util';

describe('parseServersConfig', () => {
  it('returns an empty list for an empty string', () => {
    expect(parseServersConfig('')).toEqual([]);
  });

  it('parses a single server entry', () => {
    expect(parseServersConfig('nats://nats:4222')).toEqual(['nats://nats:4222']);
  });

  it('splits, trims, and drops blank entries across multiple servers', () => {
    expect(parseServersConfig(' nats://a:4222 , nats://b:4222 ,, ')).toEqual(['nats://a:4222', 'nats://b:4222']);
  });

  it('returns an empty list when only separators and whitespace are present', () => {
    expect(parseServersConfig('  ,  , ')).toEqual([]);
  });
});
