# @app/backend-mongodb-main

## Purpose

Provides validated native MongoDB configuration, a global NestJS `MongoClient`
lifecycle, fail-closed transaction-topology checks, bounded transaction retry
handling, shared health indicators, and the MongoDB-only OpenTelemetry
instrumentation factory used by generated provider composition. Standalone
MongoDB is not supported.

`MongoMainModule.forRoot()` requires `MONGODB_URI` and `MONGODB_DATABASE`. The
optional `MONGODB_REPLICA_SET` pins the expected replica-set name. Client startup
rejects standalone, direct, load-balanced, session-less, non-primary replica-set,
and transaction-incompatible deployments before exporting the client.

The low-level topology validator also recognizes a transaction-capable sharded
deployment when no replica-set name is pinned. Repository setup, database
operations, Compose, and Helm require an explicit unsharded replica set, so that
validator branch is not an integrated deployment support claim.

Use `MongoClientToken` and `MongoDatabaseToken` for Nest injection. Use
`runInMongoTransaction()` for native-driver transactions; the callback must pass
its supplied `ClientSession` to every MongoDB operation and must not run parallel
operations within that session. Transactions use snapshot reads, majority
writes, primary preference, and bounded body/commit retries.

## Commands

```bash
pnpm exec nx run @app/backend-mongodb-main:build
pnpm exec nx run @app/backend-mongodb-main:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../../AGENTS.md)
- [Repository architecture](../../../../../../docs/architecture.md)
- [Testing](../../../../../../docs/testing.md)
