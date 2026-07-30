# @app/backend-postgres-main

## Purpose

Provides shared MikroORM/PostgreSQL configuration, root module composition,
transactions, dependency health adapters, migration-readiness indicators, and
the PostgreSQL-only OpenTelemetry instrumentation factory used by generated
provider composition.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main:build
pnpm exec nx run @app/backend-postgres-main:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
