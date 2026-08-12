# @app/backend-feature-fiat-currency-main

## Purpose

The runtime half of the fiat catalogue: the service that lists, upserts and
deactivates currencies and converts amounts between them, the scheduled refresh
that pulls quotes from a rate source, and the admin HTTP controller behind the
catalogue permissions.

The module is bound to a persistence axis by `FiatCurrencyMainModule.forRoot`,
so nothing here knows whether the rows live in PostgreSQL or MongoDB. A refresh
walks the configured rate sources in turn and reports rather than throws: a
source that fails is recorded as a named failure and the remaining sources still
record their quotes, so one broken provider cannot empty the catalogue's rates.

## Commands

```bash
pnpm exec nx run @app/backend-feature-fiat-currency-main:build
pnpm exec nx run @app/backend-feature-fiat-currency-main:test
```

## Docs

- [Fiat currency catalogue](../../../../../../docs/fiat-currency-catalogue.md)
- [Local agent rules](AGENTS.md)
