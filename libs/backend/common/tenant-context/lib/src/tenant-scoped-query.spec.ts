// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { describe, expect, it } from 'vitest';
import { withAmbientTenant } from './tenant-scope';
import { TenantDiscriminator, assertTenantScoped, tenantScopeFilter, tenantScopedWhere } from './tenant-scoped-query';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

describe('tenantScopedWhere', () => {
  it('adds the ambient tenant to a query filter', () => {
    const where = withAmbientTenant(tenantA, () => tenantScopedWhere({ status: 'active' }));

    expect(where).toEqual({ status: 'active', [TenantDiscriminator]: tenantA });
  });

  it('scopes an empty filter, so a bare list query is still tenant-bound', () => {
    expect(withAmbientTenant(tenantA, () => tenantScopedWhere())).toEqual({ [TenantDiscriminator]: tenantA });
  });

  it('accepts a filter that already names the ambient tenant', () => {
    const where = withAmbientTenant(tenantA, () => tenantScopedWhere({ [TenantDiscriminator]: tenantA }));

    expect(where).toEqual({ [TenantDiscriminator]: tenantA });
  });

  it('refuses a filter naming a different tenant than the ambient one', () => {
    expect(() => withAmbientTenant(tenantA, () => tenantScopedWhere({ [TenantDiscriminator]: tenantB }))).toThrow(
      /cross-tenant/u,
    );
  });

  it('refuses to build a filter with no ambient tenant established', () => {
    expect(() => tenantScopedWhere({ status: 'active' })).toThrow(/No ambient tenant/u);
  });
});

describe('assertTenantScoped', () => {
  it('accepts a query filter carrying the discriminator', () => {
    expect(() => {
      assertTenantScoped({ [TenantDiscriminator]: tenantA }, 'orders.findActive');
    }).not.toThrow();
  });

  it('names the offending query when the discriminator is missing', () => {
    expect(() => {
      assertTenantScoped({ status: 'active' }, 'orders.findActive');
    }).toThrow('orders.findActive');
  });

  it('rejects an undefined discriminator, which would match every row', () => {
    expect(() => {
      assertTenantScoped({ [TenantDiscriminator]: undefined }, 'orders.findActive');
    }).toThrow('orders.findActive');
  });

  it('rejects a filter that is not an object', () => {
    expect(() => {
      assertTenantScoped(undefined, 'orders.findActive');
    }).toThrow('orders.findActive');
  });
});

describe('tenantScopeFilter', () => {
  it('is applied by default so an entity opts out rather than in', () => {
    expect(tenantScopeFilter.default).toBe(true);
    expect(tenantScopeFilter.args).toBe(false);
  });

  it('resolves the condition from the ambient tenant at query time', () => {
    expect(withAmbientTenant(tenantB, () => tenantScopeFilter.cond())).toEqual({ [TenantDiscriminator]: tenantB });
  });

  it('fails loudly rather than returning every tenant when no scope is established', () => {
    expect(() => tenantScopeFilter.cond()).toThrow(/No ambient tenant/u);
  });
});
