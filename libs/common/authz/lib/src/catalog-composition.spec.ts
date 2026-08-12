// @requirements REQ-AUTH-ACCESS-001
// Evidence for: REQ-AUTH-ACCESS-001
import { describe, expect, it } from 'vitest';
import { composeAuthzCatalog, type AuthzExtension } from './catalog-composition';
import type { PermissionDefinition } from './types';

const basePermissions: readonly PermissionDefinition[] = [
  { key: 'profile:read', resource: 'profile', action: 'read', description: 'Read own profile.' },
  { key: 'admin:users:read', resource: 'admin.users', action: 'read', description: 'Read users.' },
];

const baseGrants = {
  user: ['profile:read'],
  admin: ['admin:users:read'],
} as const;

const compose = (extensions: readonly AuthzExtension[]) =>
  composeAuthzCatalog({ permissions: basePermissions, grants: baseGrants, extensions });

const catalogExtension: AuthzExtension = {
  id: 'catalog',
  permissions: [
    { key: 'catalog:items:read', resource: 'catalog.items', action: 'read', description: 'Read items.' },
    { key: 'catalog:items:write', resource: 'catalog.items', action: 'write', description: 'Write items.' },
  ],
  grants: [
    { role: 'admin', permissions: ['catalog:items:read', 'catalog:items:write'] },
    { role: 'merchant', permissions: ['catalog:items:read', 'catalog:items:write'] },
  ],
};

describe('composeAuthzCatalog', () => {
  it('returns the base catalog untouched when no product extension is registered', () => {
    const composed = compose([]);

    expect(composed.permissions).toEqual(basePermissions);
    expect(composed.roles).toEqual(['user', 'admin']);
    expect(composed.rolePermissions).toEqual({ user: ['profile:read'], admin: ['admin:users:read'] });
  });

  it('appends product permissions after the base catalog, preserving declaration order', () => {
    expect(compose([catalogExtension]).permissions.map((entry) => entry.key)).toEqual([
      'profile:read',
      'admin:users:read',
      'catalog:items:read',
      'catalog:items:write',
    ]);
  });

  it('extends an existing role without restating its base grants', () => {
    expect(compose([catalogExtension]).rolePermissions.admin).toEqual([
      'admin:users:read',
      'catalog:items:read',
      'catalog:items:write',
    ]);
    expect(compose([catalogExtension]).rolePermissions.user).toEqual(['profile:read']);
  });

  it('introduces product roles after the base roles', () => {
    const composed = compose([catalogExtension]);

    expect(composed.roles).toEqual(['user', 'admin', 'merchant']);
    expect(composed.rolePermissions.merchant).toEqual(['catalog:items:read', 'catalog:items:write']);
  });

  it('de-duplicates repeated grants within a role', () => {
    const composed = compose([
      {
        id: 'a',
        permissions: catalogExtension.permissions,
        grants: [{ role: 'admin', permissions: ['catalog:items:read'] }],
      },
      { id: 'b', grants: [{ role: 'admin', permissions: ['catalog:items:read'] }] },
    ]);

    expect(composed.rolePermissions.admin).toEqual(['admin:users:read', 'catalog:items:read']);
  });

  it('refuses a product permission that collides with a base permission', () => {
    expect(() =>
      compose([
        {
          id: 'catalog',
          permissions: [
            { key: 'admin:users:read', resource: 'catalog.items', action: 'read', description: 'Shadowed.' },
          ],
        },
      ]),
    ).toThrow('authz extension "catalog" redefines permission "admin:users:read"');
  });

  it('refuses two product extensions that define the same permission key', () => {
    expect(() =>
      compose([
        { id: 'catalog', permissions: [catalogExtension.permissions![0]!] },
        { id: 'billing', permissions: [catalogExtension.permissions![0]!] },
      ]),
    ).toThrow('authz extension "billing" redefines permission "catalog:items:read"');
  });

  it('refuses a grant for a permission that is in no catalog (fail closed)', () => {
    expect(() =>
      compose([{ id: 'catalog', grants: [{ role: 'admin', permissions: ['catalog:items:delete'] }] }]),
    ).toThrow('authz extension "catalog" grants unknown permission "catalog:items:delete" to role "admin"');
  });

  it('refuses a permission entry that is missing its resource or action metadata', () => {
    expect(() =>
      compose([
        { id: 'catalog', permissions: [{ key: 'catalog:items:read', resource: '', action: 'read', description: 'x' }] },
      ]),
    ).toThrow('authz extension "catalog" defines permission "catalog:items:read" without a resource');
  });

  it('resolves grants for a role set and contributes nothing for unknown roles', () => {
    const composed = compose([catalogExtension]);

    expect(composed.permissionsForRoles(['merchant'])).toEqual(['catalog:items:read', 'catalog:items:write']);
    expect(composed.permissionsForRoles(['admin', 'user'])).toEqual([
      'admin:users:read',
      'catalog:items:read',
      'catalog:items:write',
      'profile:read',
    ]);
    expect(composed.permissionsForRoles(['support'])).toEqual([]);
    expect(composed.permissionsForRoles([])).toEqual([]);
  });
});
