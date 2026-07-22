---
name: migrate-database
description: Design, generate, and verify safe MikroORM database migrations. Use when changing entities, indexes, constraints, repositories, data backfills, migration ordering, rollback behavior, or database compatibility.
---

# Migrate a database

## Read first

- Read `../../../docs/database-migrations.md`, `../../../docs/command-matrix.md`,
  the owning entity/repository, current migrations, and database test setup.
- Identify the bounded context and database owner before changing schema. Do not place persistence code in a deployable app.

## Workflow

1. Change the canonical entity and persistence behavior first, then generate or author the smallest migration that realizes the intended schema.
2. Review SQL for locks, table rewrites, data loss, nullability transitions, default evaluation, index cost, constraint timing, and compatibility with rolling application versions.
3. Split unsafe shape changes into expand, backfill, and contract phases when production data or concurrent versions require it.
4. Give data migrations deterministic batching, restartability, and explicit failure behavior. Never assume an empty database.
5. Implement and inspect rollback behavior when reversal is safe. Document irreversible operations rather than pretending they can be undone.
6. Add repository/integration tests for constraints, indexes, transaction behavior, and affected queries.

## Verification

Run `pnpm run db:migrations:check`, owning tests, and applicable Testcontainers
integration against a fresh database, an upgraded schema, and the safe rollback
path when one exists. Never run destructive or production database commands
without explicit current-task authorization.
