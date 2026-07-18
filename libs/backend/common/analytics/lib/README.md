# @app/backend-common-analytics

## Purpose

Routes typed analytics events through configurable GA4, PostHog, Umami,
logger, or no-op providers behind one Nest module and service boundary.

## Commands

```bash
pnpm exec nx run @app/backend-common-analytics:build
pnpm exec nx run @app/backend-common-analytics:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
