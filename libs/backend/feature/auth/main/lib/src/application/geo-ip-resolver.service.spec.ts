// @requirements REQ-AUTH-ACCESS-001
import { afterEach, describe, expect, it } from 'vitest';
import { GeoIpResolverService, normalizeIp } from './geo-ip-resolver.service';

afterEach(() => delete process.env.AUTH_GEOIP_DATABASE_PATH);

describe('GeoIpResolverService', () => {
  it('normalizes IPv4-mapped addresses and skips private or unconfigured lookups', async () => {
    expect(normalizeIp(' ::ffff:203.0.113.10 ')).toBe('203.0.113.10');
    expect(normalizeIp('')).toBeUndefined();
    const resolver = new GeoIpResolverService();
    await expect(resolver.resolve('127.0.0.1')).resolves.toEqual({});
    await expect(resolver.resolve('not-an-ip')).resolves.toEqual({});
    await expect(resolver.resolve('203.0.113.10')).resolves.toEqual({});
  });
});
