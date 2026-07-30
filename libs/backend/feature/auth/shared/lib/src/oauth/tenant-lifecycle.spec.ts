// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from './access-control.types';
import { DefaultAuthTenantId } from './tenant-context';
import {
  TenantRole,
  normalizeTenantDomain,
  normalizeTenantRoles,
  normalizeTenantSlug,
  readTenantDomainHeader,
  resolveTenantRequestContext,
} from './tenant-lifecycle';

const tenantIdFixture = '11111111-1111-4111-8111-111111111111';

describe('tenant lifecycle normalization', () => {
  it('normalizes tenant slugs and rejects malformed labels', () => {
    expect(normalizeTenantSlug(' ACME ')).toBe('acme');
    expect(normalizeTenantSlug('acme-corp')).toBe('acme-corp');
    expect(normalizeTenantSlug(undefined)).toBeUndefined();
    expect(normalizeTenantSlug('')).toBeUndefined();
    expect(normalizeTenantSlug('-leading')).toBeUndefined();
    expect(normalizeTenantSlug('trailing-')).toBeUndefined();
  });

  it('normalizes tenant domains, strips ports, and rejects invalid hosts', () => {
    expect(normalizeTenantDomain('Acme.Example.com:8443')).toBe('acme.example.com');
    expect(normalizeTenantDomain(undefined)).toBeUndefined();
    expect(normalizeTenantDomain('acme..example.com')).toBeUndefined();
    expect(normalizeTenantDomain('-bad.example.com')).toBeUndefined();
    expect(normalizeTenantDomain(`${'a'.repeat(254)}.com`)).toBeUndefined();
  });

  it('normalizes tenant roles case-insensitively, dedupes, and defaults to member', () => {
    expect(normalizeTenantRoles(['Owner', 'ADMIN', 'owner'])).toEqual([TenantRole.Owner, TenantRole.Admin]);
    expect(normalizeTenantRoles(['not-a-role'])).toEqual([TenantRole.Member]);
    expect(normalizeTenantRoles([])).toEqual([TenantRole.Member]);
  });
});

describe('readTenantDomainHeader', () => {
  it('reads the tenant domain from direct, uppercase, array, and getter headers', () => {
    expect(
      readTenantDomainHeader({
        headers: { 'x-tenant-domain': 'acme.example.com' },
      }),
    ).toBe('acme.example.com');
    expect(
      readTenantDomainHeader({
        headers: { 'X-TENANT-DOMAIN': 'upper.example.com' },
      }),
    ).toBe('upper.example.com');
    expect(
      readTenantDomainHeader({
        headers: { 'x-nrb-tenant-domain': ['team.example.com', 'ignored'] },
      }),
    ).toBe('team.example.com');
    expect(
      readTenantDomainHeader({
        get: (name) => (name === 'x-tenant-domain' ? 'getter.example.com' : undefined),
      }),
    ).toBe('getter.example.com');
    expect(
      readTenantDomainHeader({
        get: (name) => (name === 'X-TENANT-DOMAIN' ? 'getter-upper.example.com' : undefined),
      }),
    ).toBe('getter-upper.example.com');
    expect(readTenantDomainHeader({ headers: {} })).toBeUndefined();
  });

  it('skips blank direct header values', () => {
    expect(readTenantDomainHeader({ headers: { 'x-tenant-domain': '   ' } })).toBeUndefined();
  });
});

describe('resolveTenantRequestContext', () => {
  it('prefers a valid tenant id header', () => {
    expect(
      resolveTenantRequestContext({
        headers: { 'x-tenant-id': tenantIdFixture },
      }),
    ).toEqual({ tenantId: tenantIdFixture, source: 'header' });
  });

  it('falls back to a normalized tenant domain header', () => {
    expect(
      resolveTenantRequestContext({
        headers: { 'x-tenant-domain': 'Acme.Example.com' },
      }),
    ).toEqual({
      tenantId: DefaultAuthTenantId,
      tenantDomain: 'acme.example.com',
      source: 'host',
    });
  });

  it('derives the tenant domain from the host header, unwrapping arrays and ports', () => {
    expect(
      resolveTenantRequestContext({
        headers: { host: ['tenant.example.com:3000', 'ignored'] },
      }),
    ).toEqual({
      tenantId: DefaultAuthTenantId,
      tenantDomain: 'tenant.example.com',
      source: 'host',
    });
  });

  it('derives the tenant domain from a capitalized Host header', () => {
    const request: AuthenticatedRequest = {
      headers: { Host: 'cap.example.com' },
    };
    expect(resolveTenantRequestContext(request)).toEqual({
      tenantId: DefaultAuthTenantId,
      tenantDomain: 'cap.example.com',
      source: 'host',
    });
  });

  it('returns the default tenant when no tenant hints are present', () => {
    expect(resolveTenantRequestContext({ headers: {} })).toEqual({
      tenantId: DefaultAuthTenantId,
      source: 'default',
    });
  });
});
