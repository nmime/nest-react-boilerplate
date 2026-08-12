# @app/common-authz

## Purpose

Normalizes roles and permissions and exposes the permission catalog and role
matrix used by backend authorization and frontend access-policy checks.

## Extending

A product adds permissions and role grants in `src/product-authz.ts` — the only file it edits here.
The base catalog and role matrix stay boilerplate-owned, so an upgrade never conflicts:

```ts
export const productAuthzExtensions: readonly AuthzExtension[] = [
  {
    id: 'catalog',
    permissions: [{ key: 'catalog:items:read', resource: 'catalog.items', action: 'read', description: '…' }],
    grants: [{ role: 'merchant', permissions: ['catalog:items:read'] }],
  },
];
```

Grants may name a base role or a new one. Everything downstream reads the composed result:
`permissionCatalog`, `roleKeys` and `rolePermissions` here, and the backend admin catalog, CASL
vocabulary and role DTO enums in `@app/backend-feature-admin-shared`. A product permission never
has to be granted to the `admin` role to become assignable or gateable.

## Commands

```bash
pnpm exec nx run @app/common-authz:build
pnpm exec nx run @app/common-authz:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
