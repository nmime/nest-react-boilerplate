# @app/frontend-feature-admin-shared

## Purpose

Defines frontend-safe admin access-policy contracts and normalization used to
gate admin navigation and product surfaces without importing backend code.

## Extending

A product adds admin console capabilities in `src/product-admin-capabilities.ts` — the only file it
edits here. The shared `AdminCapabilityPermissions` map stays boilerplate-owned:

```ts
export const productAdminCapabilityExtensions = [
  { id: 'catalog', capabilities: { canReadCatalogItems: 'catalog:items:read' } },
] as const satisfies readonly AdminCapabilityExtension[];
```

Keep the `as const satisfies`: the composed map is what `AdminAccessPolicy` is derived from, so the
capability name reaches every consumer of the policy — including the admin route registry's `access`
guard and page props — without widening or casting them. The permission it names must exist in the
composed RBAC catalog, which products register through `productAuthzExtensions` in
`@app/common-authz`.

## Commands

```bash
pnpm exec nx run @app/frontend-feature-admin-shared:build
pnpm exec nx run @app/frontend-feature-admin-shared:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [Frontend FSD](../../../../../../docs/frontend-fsd.md)
