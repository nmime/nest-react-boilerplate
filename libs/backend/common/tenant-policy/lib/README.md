# @app/backend-common-tenant-policy

## Purpose

Postgres tenant row-level-security DDL: the tenant-scoped table registry and the policy statements its migrations install. A dependency-free leaf so the pruned migrator image can import it.

## Commands

```bash
pnpm exec nx run @app/backend-common-tenant-policy:test
pnpm exec nx run @app/backend-common-tenant-policy:build
```
