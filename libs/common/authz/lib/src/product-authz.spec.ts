// @requirements REQ-AUTH-ACCESS-001
// Evidence for: REQ-AUTH-ACCESS-001
import { afterEach, describe, expect, it, vi } from 'vitest';
import { basePermissionCatalog, baseRolePermissions, productAuthzExtensions } from './index';

const productExtension = {
  id: 'catalog',
  permissions: [
    { key: 'catalog:items:read', resource: 'catalog.items', action: 'read', description: 'Read catalog items.' },
  ],
  grants: [
    { role: 'admin', permissions: ['catalog:items:read'] },
    { role: 'merchant', permissions: ['catalog:items:read'] },
  ],
};

afterEach(() => {
  vi.doUnmock('./product-authz');
  vi.resetModules();
});

describe('@app/common-authz product extension seam', () => {
  it('ships empty so the boilerplate catalog is exactly the base catalog', async () => {
    const { permissionCatalog, roleKeys } = await import('./index');

    expect(productAuthzExtensions).toEqual([]);
    expect(permissionCatalog).toEqual(basePermissionCatalog);
    expect(roleKeys).toEqual(Object.keys(baseRolePermissions));
  });

  it('reaches every shared export once a product registers an extension', async () => {
    vi.resetModules();
    vi.doMock('./product-authz', () => ({ productAuthzExtensions: [productExtension] }));

    const authz = await import('./index');

    expect(authz.isKnownPermission('catalog:items:read')).toBe(true);
    expect(authz.permissionCatalog.at(-1)?.key).toBe('catalog:items:read');
    expect(authz.permissionToAbilityTarget('catalog:items:read')).toEqual({
      action: 'read',
      resource: 'catalog.items',
    });
    expect(authz.roleKeys).toEqual(['user', 'admin', 'merchant']);
    expect(authz.rolePermissions.admin).toContain('catalog:items:read');
    expect(authz.permissionsForRoles(['merchant'])).toEqual(['catalog:items:read']);
    expect(authz.permissionsForRoles(['support'])).toEqual([]);
  });

  it('leaves the base catalog and base matrix untouched by product extensions', async () => {
    vi.resetModules();
    vi.doMock('./product-authz', () => ({ productAuthzExtensions: [productExtension] }));

    const authz = await import('./index');

    expect(authz.basePermissionCatalog.map((entry) => entry.key)).not.toContain('catalog:items:read');
    expect(authz.baseRolePermissions.admin).not.toContain('catalog:items:read');
  });
});
