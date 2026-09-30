# @app/backend-mongodb-main-fiat-currency

## Purpose

Native MongoDB persistence for the fiat catalogue: the currency and rate
collections with their schema validators and indexes, the migration that owns
them, and the repository implementing `FiatCurrencyPersistence`.

The currency code is the document `_id`, and the localized name and symbol are
locale maps on the document, mirroring the `jsonb` columns on the other axis so
the port answers identically either way. Rate history and headline updates share
one native MongoDB transaction for the complete provider batch. An invalid or
conflicting observation rolls back the batch; retries preserve the original
history observation, and older observations do not replace a newer headline.
The runtime requires a transaction-capable replica set, as provided by the
selected MongoDB deployment topology.

## Commands

```bash
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:build
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:test
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:component-test
```

## Docs

- [Fiat currency catalogue](../../../../../../docs/fiat-currency-catalogue.md)
- [Local agent rules](AGENTS.md)
