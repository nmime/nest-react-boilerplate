# @app/backend-postgres-main-feature-flags

## Purpose

Implements the shared feature-flag provider against MikroORM/PostgreSQL and
exports the persistence module, entity, repository, and migrations.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main-feature-flags:build
pnpm exec nx run @app/backend-postgres-main-feature-flags:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
