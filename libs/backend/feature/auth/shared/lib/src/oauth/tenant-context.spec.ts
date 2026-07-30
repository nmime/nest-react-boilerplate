// @requirements REQ-AUTH-CREDENTIAL-003
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './access-control.types';
import {
  assertRequestTenantMatchesPrincipal,
  normalizeTenantId,
  readTenantIdHeader,
  resolveTenantId,
  DefaultAuthTenantId,
} from './tenant-context';

const tenantIdFixture = '11111111-1111-4111-8111-111111111111';
const otherTenantIdFixture = '22222222-2222-4222-8222-222222222222';
const principal: AuthenticatedPrincipal = {
  subject: 'user-id',
  tenantId: tenantIdFixture,
  roles: ['user'],
  permissions: ['profile:read'],
};

describe('tenant context helpers', () => {
  it('normalizes tenant ids and resolves the default tenant', () => {
    expect(normalizeTenantId(tenantIdFixture.toUpperCase())).toBe(tenantIdFixture);
    expect(normalizeTenantId('not-a-uuid')).toBeUndefined();
    expect(resolveTenantId(undefined)).toBe(DefaultAuthTenantId);
  });

  it('reads tenant headers and rejects tenant mismatch', () => {
    const request: AuthenticatedRequest = {
      headers: { 'x-tenant-id': tenantIdFixture },
    };
    expect(readTenantIdHeader(request)).toBe(tenantIdFixture);
    assertRequestTenantMatchesPrincipal(request, principal);
    expect(request.tenantId).toBe(tenantIdFixture);

    expect(() => {
      assertRequestTenantMatchesPrincipal({ headers: { 'x-tenant-id': otherTenantIdFixture } }, principal);
    }).toThrow(UnauthorizedException);
  });

  it('reads the first value of an array tenant id header', () => {
    expect(
      readTenantIdHeader({
        headers: { 'x-tenant-id': [tenantIdFixture, 'ignored'] },
      }),
    ).toBe(tenantIdFixture);
  });

  it('reads the tenant id from a request getter header when no direct header is set', () => {
    const request: AuthenticatedRequest = {
      get: (name) => (name === 'x-tenant-id' ? tenantIdFixture : undefined),
    };
    expect(readTenantIdHeader(request)).toBe(tenantIdFixture);
  });

  it('rejects a malformed tenant id header before comparing to the principal', () => {
    expect(() => {
      assertRequestTenantMatchesPrincipal({ headers: { 'x-tenant-id': 'not-a-uuid' } }, principal);
    }).toThrow(UnauthorizedException);
    expect(() => {
      assertRequestTenantMatchesPrincipal({ headers: { 'x-tenant-id': 'not-a-uuid' } }, principal);
    }).toThrow('Invalid tenant id.');
  });

  it('assigns the principal tenant when no tenant header is provided', () => {
    const request: AuthenticatedRequest = { headers: {} };
    assertRequestTenantMatchesPrincipal(request, principal);
    expect(request.tenantId).toBe(tenantIdFixture);
  });
});
