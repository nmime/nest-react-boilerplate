# @app/common-money

## Purpose

Represents monetary amounts as whole minor units plus an ISO 4217 currency, with
arithmetic, exact-ratio scaling, total-preserving allocation, and decimal
parsing/formatting that never routes a value through a binary float. Shared so
backend pricing and frontend display agree on one representation.

Every operation hangs off the `Money` namespace — `Money.of`, `Money.add`,
`Money.multiply` — and `Money` is also the type of the value they carry, so one
import gives you both.

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
