# @app/backend-common-health

## Purpose

Owns the standard health, liveness, readiness, and private health endpoints,
indicator contracts, response mapping, sanitization, and shutdown support.

Indicators describe the configured dependency lane. An in-memory/Map fixture's
`ok` is process-level evidence and makes no durability claim. Auth memory mode
skips database checks and is refused in production. MongoDB provider readiness
requires reachability, transaction-compatible topology, and shared migration
verification; selected feature migration execution remains a separate job.

## Commands

```bash
pnpm exec nx run @app/backend-common-health:build
pnpm exec nx run @app/backend-common-health:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
