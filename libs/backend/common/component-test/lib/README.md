# @app/backend-common-component-test

## Purpose

Provides component-test lifecycle helpers and reusable PostgreSQL, Redis, NATS,
SeaweedFS, MySQL, and generic Testcontainers without starting them in unit tests.

The `@app/backend-common-component-test-runtime` entrypoint exposes Docker
availability probes without loading database-specific container helpers.
Component suites for a MongoDB selection use that entrypoint and mark their
test-only import with `nx-ignore-next-line`, so production builds retain only
the selected database provider. The existing main entrypoint still exports the
full set of provider test helpers for maintainer test runs.

## Commands

```bash
pnpm exec nx run @app/backend-common-component-test:build
pnpm exec nx run @app/backend-common-component-test:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
