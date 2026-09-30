---
name: migrate-database
description: Design, generate, and verify safe PostgreSQL or MongoDB migrations for the selected provider. Use when changing entities, collection validators, indexes, constraints, repositories, data backfills, migration ordering, rollback behavior, or database compatibility.
---

# Migrate a database

## Read first

- Read `../../../docs/database-migrations.md`, `../../../docs/command-matrix.md`,
  the owning entity/repository, current migrations, and database test setup.
- Identify the bounded context and database owner before changing schema. Do not place persistence code in a deployable app.
- Resolve the selected provider from the official configuration and inspect its
  canonical migration ledger. PostgreSQL uses MikroORM; MongoDB uses native
  migration objects and a replica set. Do not infer provider from an installed package.

## Workflow

1. Change the canonical entity or collection definition and persistence behavior
   first, then generate or author the smallest migration that realizes the schema.
   Export it through its provider owner and include that owner in the canonical
   ledger; a shipped migration absent from the ledger will never execute.
2. For PostgreSQL, review SQL for locks, table rewrites, data loss, nullability
   transitions, default evaluation, index cost, constraint timing, and rolling
   compatibility. For MongoDB, review strict validators, deterministic indexes,
   transactional writes, and exact verification after replay. Repair an existing
   collection with a new ordered migration; do not rewrite its deployed migration.
3. Split unsafe shape changes into expand, backfill, and contract phases when production data or concurrent versions require it.
4. Give data migrations deterministic batching, restartability, and explicit failure behavior. Never assume an empty database.
5. Implement and inspect PostgreSQL rollback when reversal is safe. MongoDB uses
   corrective roll-forward migrations and has no automatic down path. Document
   irreversible operations rather than pretending they can be undone.
6. Add repository/integration tests for constraints, indexes, transaction behavior, and affected queries.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run `pnpm run db:migrations:check`, owning tests, and applicable Testcontainers
integration against a fresh database, an upgraded schema, and the safe rollback
path when one exists. For MongoDB, use an actual replica set, verify ledger
completeness and idempotent replay, and assert collection validators/indexes.
Never run destructive or production database commands
without explicit current-task authorization.
