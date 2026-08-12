# @app/common-money

## Purpose

Represents monetary amounts as whole minor units plus an ISO 4217 currency, with
arithmetic, exact-ratio scaling, total-preserving allocation, and decimal
parsing/formatting that never routes a value through a binary float. Shared so
backend pricing and frontend display agree on one representation.

## Commands

```bash
pnpm exec nx run @app/common-money:build
pnpm exec nx run @app/common-money:test
```

## Docs

- [Backend product primitives](../../../../docs/backend-product-primitives.md)
- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
