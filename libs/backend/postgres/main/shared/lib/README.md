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

PostgreSQL ORM, Better Auth, and first-party session pools share
`createPostgresConnectionOptions`. A URI TLS policy takes precedence over
legacy environment defaults; otherwise `PGSSLMODE` or `POSTGRES_SSL` selects
TLS. `POSTGRES_SSL_REJECT_UNAUTHORIZED` defaults to verification for flag-based
configuration. For a remote server, use `sslmode=verify-full` and supply
`sslrootcert` when a private CA is required. The resolver retains URI trust
material and passes it directly to the pool because node-postgres reparsing
can replace a separately supplied SSL object. See the
[node-postgres SSL contract](https://node-postgres.com/features/ssl).

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
