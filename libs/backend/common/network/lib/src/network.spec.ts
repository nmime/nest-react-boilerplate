// @requirements REQ-RUNTIME-BOUNDARY-010
import { describe, expect, it } from 'vitest';
import {
  buildIpAllowList,
  getClientIp,
  isIpInAllowList,
  isPrivateNetworkIp,
  isRequestFromPrivateNetwork,
  parseCidr,
} from './index';

/* eslint-disable sonarjs/no-hardcoded-ip -- These addresses are deterministic fixtures for CIDR behavior. */
describe('network helpers', () => {
  it('detects private IPv4 ranges', () => {
    expect(isPrivateNetworkIp('10.1.2.3')).toBe(true);
    expect(isPrivateNetworkIp('172.16.0.1')).toBe(true);
    expect(isPrivateNetworkIp('192.168.1.10')).toBe(true);
    expect(isPrivateNetworkIp('8.8.8.8')).toBe(false);
  });

  it('supports explicit CIDR allow lists', () => {
    expect(isIpInAllowList('203.0.113.10', buildIpAllowList(['203.0.113.0/24']))).toBe(true);
    expect(isIpInAllowList('203.0.114.10', buildIpAllowList(['203.0.113.0/24']))).toBe(false);
  });

  it('uses adapter-resolved request IP for private-network request checks', () => {
    expect(
      isRequestFromPrivateNetwork({
        headers: { 'x-forwarded-for': '127.0.0.1, 10.0.0.1' },
        ip: '203.0.113.9',
      }),
    ).toBe(false);
  });

  it('uses adapter-resolved or socket addresses instead of spoofable forwarding headers', () => {
    expect(
      getClientIp({
        headers: { 'x-forwarded-for': '127.0.0.1, 10.0.0.1' },
        ip: '203.0.113.9',
        socket: { remoteAddress: '198.51.100.10' },
      }),
    ).toBe('203.0.113.9');
    expect(
      getClientIp({
        headers: { 'x-forwarded-for': '127.0.0.1, 10.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe('127.0.0.1');
  });

  it('falls back through empty request and socket addresses to undefined', () => {
    // No ip and no socket at all.
    expect(getClientIp({})).toBeUndefined();
    // Whitespace-only adapter ip is treated as absent, then no socket.
    expect(getClientIp({ ip: '   ' })).toBeUndefined();
    // Socket present but without a remote address.
    expect(getClientIp({ socket: {} })).toBeUndefined();
    // Explicit null remote address.
    expect(getClientIp({ socket: { remoteAddress: null } })).toBeUndefined();
    // Whitespace-only remote address trims to empty and is discarded.
    expect(getClientIp({ socket: { remoteAddress: '   ' } })).toBeUndefined();
    // Adapter ip missing but socket address present.
    expect(getClientIp({ socket: { remoteAddress: '198.51.100.7' } })).toBe('198.51.100.7');
  });
});

/* eslint-disable sonarjs/no-hardcoded-ip -- Deterministic CIDR fixtures. */
describe('parseCidr', () => {
  it('defaults the prefix length to /32 when the mask is omitted', () => {
    expect(parseCidr('10.0.0.5')).toEqual({
      cidr: '10.0.0.5',
      base: 0x0a000005,
      mask: 0xffffffff,
    });
  });

  it('treats a /0 prefix as a zero mask that matches everything', () => {
    const entry = parseCidr('0.0.0.0/0');
    expect(entry.mask).toBe(0);
    expect(entry.base).toBe(0);
    expect(isIpInAllowList('8.8.8.8', [entry])).toBe(true);
  });

  it('normalizes an IPv4-mapped IPv6 address before masking', () => {
    const entry = parseCidr('::ffff:192.168.0.0/16');
    expect(entry.mask).toBe(0xffff0000);
    expect(isIpInAllowList('192.168.5.20', [entry])).toBe(true);
    expect(isIpInAllowList('192.169.5.20', [entry])).toBe(false);
  });

  it('rejects an address with the wrong number of octets', () => {
    expect(() => parseCidr('1.2.3/24')).toThrow('Invalid IPv4 CIDR: 1.2.3/24');
    expect(() => parseCidr('1.2.3.4.5/24')).toThrow('Invalid IPv4 CIDR: 1.2.3.4.5/24');
  });

  it('rejects out-of-range, negative, non-numeric and non-canonical octets', () => {
    expect(() => parseCidr('256.0.0.1/24')).toThrow();
    expect(() => parseCidr('-1.0.0.1/24')).toThrow();
    expect(() => parseCidr('a.b.c.d/24')).toThrow();
    expect(() => parseCidr('01.0.0.1/24')).toThrow();
  });

  it('rejects prefix lengths outside the 0-32 range or that are not integers', () => {
    expect(() => parseCidr('10.0.0.0/33')).toThrow();
    expect(() => parseCidr('10.0.0.0/-1')).toThrow();
    expect(() => parseCidr('10.0.0.0/abc')).toThrow();
  });
});

describe('buildIpAllowList', () => {
  it('skips empty and whitespace-only entries while parsing the rest', () => {
    const entries = buildIpAllowList(['', '   ', '203.0.113.0/24']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ cidr: '203.0.113.0/24' });
  });
});

describe('isIpInAllowList edge cases', () => {
  it('returns false for absent addresses', () => {
    expect(isIpInAllowList(undefined)).toBe(false);
    expect(isIpInAllowList(null)).toBe(false);
    expect(isIpInAllowList('')).toBe(false);
  });

  it('treats the IPv6 loopback shorthand as allowed', () => {
    expect(isIpInAllowList('::1')).toBe(true);
  });

  it('returns false for unparseable addresses', () => {
    expect(isIpInAllowList('not-an-ip')).toBe(false);
    expect(isIpInAllowList('::ffff:not-an-ip')).toBe(false);
  });

  it('resolves request-based checks via the socket address', () => {
    expect(isRequestFromPrivateNetwork({ socket: { remoteAddress: '10.0.0.9' } })).toBe(true);
    expect(isRequestFromPrivateNetwork({ socket: { remoteAddress: '8.8.8.8' } })).toBe(false);
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip */
