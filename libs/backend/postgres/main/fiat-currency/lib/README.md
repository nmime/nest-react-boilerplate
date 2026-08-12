# @app/backend-postgres-main-fiat-currency

## Purpose

PostgreSQL persistence for the fiat catalogue: the `FiatCurrency` and
`FiatCurrencyRate` MikroORM entities, the repository implementing
`FiatCurrencyPersistence`, and the migration that owns both tables.

The localized name and symbol are `jsonb` locale maps on the currency row rather
than a second table, so a list read is one query with no join and no insert order
to derive. Rate history is append-only and unique per `(code, as_of, source)`, so
a provider retry lands on the row it already wrote; the headline rate advances
only when the incoming observation is newer than the stored one.

## Commands

```bash
pnpm exec nx run @app/backend-postgres-main-fiat-currency:build
pnpm exec nx run @app/backend-postgres-main-fiat-currency:test
pnpm exec nx run @app/backend-postgres-main-fiat-currency:component-test
```

## Docs

- [Fiat currency catalogue](../../../../../../docs/fiat-currency-catalogue.md)
- [Local agent rules](AGENTS.md)
