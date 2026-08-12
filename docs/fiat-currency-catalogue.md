# Fiat currency catalogue

`@app/common-money` deliberately refuses to convert between currencies: adding
US dollars to euros throws `MoneyCurrencyMismatchError`, because a rate is not a
property of an amount — it is operator data with a source and a timestamp. This
capability is where that data lives.

Selected with `--capability fiat-currency`. It requires a durable database and
ships on both persistence axes.

## What it stores

| Table / collection    | Holds                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `fiat_currencies`     | The offered currencies, their localized name and symbol, image, display order, and rate to USD |
| `fiat_currency_rates` | Every rate ever recorded, keyed by `(code, as_of, source)`                                     |

### Why the names are a column, not a table

`name` and `symbol` are `Localizations<string>` — the same locale map
`@app/common-i18n-runtime` uses everywhere else, stored as one `jsonb` column
per field (an object on the MongoDB document, constrained by the collection
validator). A currency has a handful of names, they are written with the
currency, read with the currency, and change when it does; a row per locale
bought a join on the hot list path and an insert ordering the unit of work had
no dependency to derive.

A write replaces the whole map rather than merging locale by locale: an editor
that wants to change one language sends back the map it read with that one key
changed. Merging would leave a locale nobody could delete.

Both axes constrain the value to an object of strings — `jsonb_typeof(…) =
'object'` on Postgres, `additionalProperties: { bsonType: 'string' }` in the
MongoDB validator — because both stores accept `"Euro"` or `42` as a valid
document otherwise, and a reader would then hand a scalar to the localization
resolver.

A product that needs to search names across hundreds of currencies adds a GIN
index on the column; it does not need a second table back.

### Why one rate per currency, not a pair table

Rates are stored as **USD per one major unit**, so `n` currencies cost `n` rows
rather than `n²`. A cross pair is derived: `EUR → GBP` reduces
`usdPerUnit(EUR) / usdPerUnit(GBP)` to a single exact integer ratio before it
rounds, so a conversion rounds exactly once instead of once per leg.

The rate column is `numeric(15,10)` — five integer digits cover every fiat rate
that has ever existed, and fifteen significant digits is the widest value the
exact ratio arithmetic can hold without overflowing a safe integer. The MongoDB
validator mirrors that width with a regex so the two axes cannot drift.

## Reading the catalogue

```ts
const currencies = await fiatCurrencyService.listCurrencies('ru');
// [{ code: 'EUR', name: 'Евро', symbol: '€', imageUrl: …, usdPerUnit: '1.08', rateAsOf: … }]
```

Locale resolution walks the request's own fallback chain (`ru-RU` → `ru`) and
falls back to the currency code rather than to an empty label, so a currency
nobody has translated is still nameable in the UI.

Over HTTP, when the capability is registered with `exposeHttp: true`:

```
GET /api/v1/fiat-currencies?locale=ru&includeInactive=false
GET /api/v1/fiat-currencies/EUR/rates?limit=100
```

Both are read-only. Writes (`upsertCurrency`, `deactivateCurrency`,
`recordRates`) are available on `FiatCurrencyService` but are not exposed over
HTTP by this capability — an operator write surface belongs behind the admin
RBAC catalog, and minting one here would mean shipping an admin endpoint that
skips the permission checks every other admin surface goes through. Register
the service in an admin use case and add the permission there.

## Converting

```ts
const gbp = await fiatCurrencyService.convert(Money.of(10_000, 'EUR'), 'GBP');
```

`convert` refuses rather than guessing:

- a currency the catalogue does not hold is named in the error, never converted at par;
- a currency whose rate has never been recorded cannot be converted;
- a ratio too wide for exact arithmetic is refused instead of silently truncated.

## Recording rates

A product supplies rate providers; the boilerplate ships none, because every
provider has its own terms.

```ts
class EcbRateSource extends FiatRateSource {
  readonly id = 'ecb';
  async fetchUsdRates(codes: readonly CurrencyCode[]) { … }
}

FiatCurrencyMainModule.forRoot({
  imports: [FiatCurrencyPostgresModule],
  exposeHttp: true,
  rateSources: [EcbRateSource],
});
```

`FiatRateRefreshService.refresh()` polls every registered source, records what
it gets, and reports per-source failures instead of aborting the run — one
provider being down does not stop the others from updating.

Recording is append-only and never moves backwards:

- `(code, asOf, source)` identifies one observation, so a provider retry lands
  on the existing row instead of creating a second one;
- a provider that backfills yesterday adds history without touching the
  headline rate — only a strictly newer observation advances it;
- a batch containing one malformed rate is rejected before anything is written.

On Postgres both statements share a transaction. MongoDB single-node
deployments have no transaction, so the pair is ordered deliberately: the
history row is written first, and a crash in between leaves a headline rate one
tick stale but recoverable from history — rather than a headline rate with no
evidence behind it.

## Verification

Behavior is owned by the `fiat-currency-catalog` capability in
`openspec/specs/`. The persistence invariants are proven against real
containers:

```bash
pnpm nx run @app/backend-postgres-main-fiat-currency:component-test
```

```bash
pnpm nx run @app/backend-mongodb-main-fiat-currency:component-test
```
