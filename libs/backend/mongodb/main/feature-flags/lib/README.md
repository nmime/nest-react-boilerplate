# @app/backend-mongodb-main-feature-flags

Native MongoDB persistence for tenant-scoped feature flags. The adapter owns a
strict collection validator, deterministic indexes, provider-neutral record
mapping, and idempotent initialization through the ordered MongoDB migration
ledger.

```bash
pnpm exec nx run @app/backend-mongodb-main-feature-flags:build
pnpm exec nx run @app/backend-mongodb-main-feature-flags:test
pnpm exec nx run @app/backend-mongodb-main-feature-flags:component-test
```
