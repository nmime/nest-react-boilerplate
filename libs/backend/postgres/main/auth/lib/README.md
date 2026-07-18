# @app/backend-postgres-main-auth

## Purpose

Owns MikroORM entities, migrations, repositories, token encryption and cleanup,
tenant/RBAC persistence, social identities, and the transactional outbox for auth.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main-auth:build
pnpm exec nx run @app/backend-postgres-main-auth:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Command matrix](../../../../../../docs/command-matrix.md)
- [Testing](../../../../../../docs/testing.md)
- [API contracts](../../../../../../docs/api-contracts.md)
