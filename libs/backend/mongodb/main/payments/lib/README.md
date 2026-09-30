# @app/backend-mongodb-main-payments

## Purpose

Payments native MongoDB collections, strict validators, replay-wall indexes, and the ordered-write
repository. Setup selects this persistence axis when the workspace closure chooses MongoDB;
a PostgreSQL selection wires its own implementation instead. Built-in provider adapters and
customer checkout remain planned stages, as recorded in the payment implementation change.

The repository intentionally does not use MongoDB transactions. Webhook transitions write
`receipt → event → payment`; the unique receipt index, deterministic event id, idempotent payment
transition, and final receipt update make every crash prefix replayable. Outbox publication is
at-least-once because publish precedes the persisted mark.

## Verification

```bash
pnpm exec nx run @app/backend-mongodb-main-payments:build
pnpm exec nx run @app/backend-mongodb-main-payments:test -- --coverage
pnpm exec nx run @app/backend-mongodb-main-payments:component-test
```

Component evidence requires Docker and starts an owned MongoDB container.
It never reads ambient database URLs or falls back to an existing local server;
a fixture startup failure fails the component lane. Teardown removes only the
fixture namespace and container.
