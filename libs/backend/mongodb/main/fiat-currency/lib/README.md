# @app/backend-mongodb-main-fiat-currency

## Purpose

Native MongoDB persistence for the fiat catalogue: the currency and rate
collections with their schema validators and indexes, the migration that owns
them, and the repository implementing `FiatCurrencyPersistence`.

The currency code is the document `_id`, and the localized name and symbol are
locale maps on the document, mirroring the `jsonb` columns on the other axis so
the port answers identically either way. A rate write is two statements without a
transaction, ordered so the history document lands first: a crash in between
leaves a recorded observation whose headline rate is one tick stale, which is
recoverable, where the other order would leave a rate with no evidence behind it.

## Commands

```bash
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:build
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:test
pnpm exec nx run @app/backend-mongodb-main-fiat-currency:component-test
```

## Docs

- [Fiat currency catalogue](../../../../../../docs/fiat-currency-catalogue.md)
- [Local agent rules](AGENTS.md)
