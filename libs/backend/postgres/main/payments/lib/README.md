# @app/backend-postgres-main-payments

## Purpose

Payments PostgreSQL entities, repository, and migrations.

## Verification

```bash
pnpm exec nx run @app/backend-postgres-main-payments:build
pnpm exec nx run @app/backend-postgres-main-payments:test
pnpm exec nx run @app/backend-postgres-main-payments:component-test
```

Component evidence requires Docker and starts an owned PostgreSQL container.
It never reads ambient database URLs or falls back to an existing local server;
a fixture startup failure fails the component lane. Teardown removes only that
owned container.
