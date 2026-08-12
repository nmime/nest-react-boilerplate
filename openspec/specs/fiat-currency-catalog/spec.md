# Fiat currency catalogue specification

## Purpose

Keep the set of fiat currencies a product offers, their presentation in each
locale, their rate to USD, and the history of every rate they have ever had,
explicit and auditable — on either persistence axis, without the arithmetic in
`@app/common-money` ever having to guess an exchange rate.

## Requirements

### Requirement: [REQ-FIAT-CATALOG-001] The offered currencies and their presentation are operator data

The catalogue SHALL be readable at runtime with each currency resolved for one
locale. A currency that no locale has named MUST resolve to its own code rather
than to an empty label, and a retired currency MUST NOT be offered unless the
caller explicitly asks for it.

**Evidence profile:** domain, api

**Invariants:**

- Catalogue order is total: `displayOrder` first, then the code, so a paged read
  cannot drop or repeat a row.
- A locale with no row falls back along its own chain before falling back to the
  currency code.
- Reading the catalogue costs one currency query and one translation query,
  whatever the page size.

**Failure behavior:**

- A conversion request naming a currency the catalogue does not hold is refused
  and names the missing code; it is never converted at par.

#### Scenario: A currency nobody has translated

- **WHEN** the catalogue is read in a locale that has no name for a currency
- **THEN** the currency's own code stands in as its name

#### Scenario: A retired currency

- **WHEN** the catalogue is read without asking for inactive currencies
- **THEN** currencies an operator has retired are not offered

### Requirement: [REQ-FIAT-RATE-002] Conversion goes through USD on exact arithmetic

Every stored rate SHALL be the amount of USD one major unit buys, held as
decimal text, and every conversion SHALL be performed as exact integer ratio
arithmetic that rounds exactly once.

**Evidence profile:** domain

**Invariants:**

- A rate is decimal text, never a binary float.
- A cross pair is reduced to a single ratio before rounding, so `A → B` does not
  round twice.
- A rate wider than the exact arithmetic can hold is refused, not silently
  truncated.

**Failure behavior:**

- A rate that is zero, negative, or not decimal text is rejected before it can
  reach storage.
- A currency whose rate has never been recorded cannot be converted.

#### Scenario: A rate the arithmetic cannot hold

- **WHEN** a conversion is attempted between two rates whose exact ratio exceeds
  the safe integer range
- **THEN** the conversion is refused rather than losing precision

#### Scenario: A rate that is not a positive decimal

- **WHEN** a rate of zero or below is recorded
- **THEN** it is rejected before any write is opened

### Requirement: [REQ-FIAT-HISTORY-003] Rates are append-only and never move backwards

Recording a rate SHALL append it to the history and advance the currency's
current rate in one step. A rate older than the one already stored MUST be kept
in the history without moving the current rate backwards, and re-delivering the
same observation MUST NOT create a second row.

**Evidence profile:** persistence

**Invariants:**

- `(code, asOf, source)` identifies one observation on both persistence axes.
- The current rate on a currency and the newest history row for it agree.
- The Postgres and MongoDB implementations satisfy the same port, so feature
  code never branches on the axis.

**Failure behavior:**

- A rate for a currency that is not in the catalogue is refused, naming the code.
- A batch containing one malformed rate is refused before any of it is written.

#### Scenario: A late arrival from a provider

- **WHEN** a provider re-sends a rate older than the one already stored
- **THEN** the history keeps it and the current rate is unchanged

#### Scenario: A provider retry

- **WHEN** the same `(code, asOf, source)` observation arrives twice
- **THEN** the second delivery does not create a second history row

#### Scenario: One rate provider is down

- **WHEN** a refresh runs and one of several providers fails
- **THEN** the remaining providers still record, and the failure is reported
