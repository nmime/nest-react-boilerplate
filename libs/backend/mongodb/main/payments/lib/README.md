# @app/backend-mongodb-main-payments

## Purpose

Payments native MongoDB collection, transactional repository, and idempotent indexes — the
reference persistence axis for the payments feature. Shipped but not wired while the workspace
axis is postgres (the setup tool selects exactly one axis per workspace).

## Verification

```bash
pnpm exec nx run @app/backend-mongodb-main-payments:build
pnpm exec nx run @app/backend-mongodb-main-payments:test
pnpm exec nx run @app/backend-mongodb-main-payments:component-test
```
