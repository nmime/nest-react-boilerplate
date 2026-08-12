# @app/backend-feature-fiat-currency-shared

## Purpose

The fiat catalogue's domain layer, with no database and no framework in it: the
`FiatCurrency` and `FiatRateQuote` types, the `FiatCurrencyPersistence` port both
storage axes implement, and the cross-rate arithmetic.

Conversion reduces both USD quotes and the difference in minor-unit scale to one
exact ratio before rounding, so an amount rounds once rather than once per leg.
Rate text is read as an integer ratio, never as a float, and a quote that would
need more digits than an exact integer can hold is refused rather than silently
approximated.

## Commands

```bash
pnpm exec nx run @app/backend-feature-fiat-currency-shared:build
pnpm exec nx run @app/backend-feature-fiat-currency-shared:test
```

## Docs

- [Fiat currency catalogue](../../../../../../docs/fiat-currency-catalogue.md)
- [Local agent rules](AGENTS.md)
