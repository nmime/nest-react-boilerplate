# Backend product primitives

The shared building blocks a product feature reaches for instead of inventing:
paging, idempotency, uploads, money, tenant scoping, and the two open catalogs.
Each one exists because the hand-rolled version is wrong in a way that is hard to
see in review — an unbounded list query, a duplicate charge, a float cent, a
missing tenant predicate.

None of these are opt-in machinery you have to switch on. They are ordinary
exports; the point of documenting them here is that a feature author knows they
exist before writing the fifth variation.

## Paging

`@app/backend-common-response`

One envelope and one clamp for every list route, so generated clients see a
single shape and no query can turn a list endpoint into a full-table read.

```ts
import { createPageResponse, normalizeOffsetPage, type PageResponse } from '@app/backend-common-response';

const page = normalizeOffsetPage(query, { defaultPageSize: 20, maxPageSize: 100 });
const [items, total] = await this.repository.findAndCount(filter, page);
return createPageResponse(items, { ...page, total });
```

`normalizeOffsetPage` clamps rather than rejects. DTO validation is where a
caller learns their input was wrong; this is the last line of defence that keeps
an internally-constructed query bounded. Admin list routes go through
`normalizeAdminPage`, which is this function with the admin ceiling applied.

For keyset paging, `encodePageCursor` / `decodePageCursor` carry an opaque
continuation token. `decodePageCursor` re-encodes and compares before parsing:
Node's base64url decoder silently drops out-of-alphabet characters, so without
that comparison two different cursors decode to the same bytes and a tampered
cursor is undetectable. A cursor that is not one this service issued raises
`PageCursorException`, which surfaces as a `client-data-validation` problem.

## Idempotency keys

`@app/backend-common-validation`

A retried `POST` must not charge twice. Routes that create something the caller
cannot safely repeat take a client-supplied key.

```ts
import { ApiIdempotencyKey, IdempotencyKey } from '@app/backend-common-validation';

@Post('orders')
@ApiIdempotencyKey()
createOrder(@IdempotencyKey() key: string, @Body() body: CreateOrderDto) { /* ... */ }
```

The decorator validates the `Idempotency-Key` header and raises a validation
problem when it is missing or malformed, so the route body only ever sees a
usable key. Storing the key alongside the result — and returning the stored
result on a replay — is the feature's job; the primitive is the header contract,
not the store.

## File uploads

`@app/backend-common-validation`

`readSingleFilePart` reads exactly one file part out of a `multipart/form-data`
request, applying a media-type allow-list and a size ceiling.

```ts
import { readSingleFilePart } from '@app/backend-common-validation';

const upload = await readSingleFilePart(request, {
  field: 'avatar',
  maxBytes: 2 * 1024 * 1024,
  mediaTypes: ['image/png', 'image/jpeg'],
});
```

Multipart ingress needs `@fastify/multipart` registered on the adapter; see the
extension seam documented in `bootstrap-nest-api.ts`. The function drains parts
it does not use, because an unread part leaves the parser waiting on a stream
nobody is reading and the request hangs rather than fails.

For large files, prefer a presigned direct-to-storage upload over a buffered
body; `@app/backend-common-s3` issues those.

## Money

`@app/common-money`

Amounts are a whole number of minor units plus an ISO 4217 code. A `number` of
major units cannot represent money — `0.1 + 0.2` is not `0.3`, and the error
compounds through every discount and split.

The operations hang off one `Money` namespace, and `Money` is also the type of
the value they carry, so a single import gives you both.

```ts
import { Money } from '@app/common-money';

const price = Money.parse('19.99', 'USD');
const tax = Money.multiply(price, Money.rate('0.075')); // exact 75/1000, not a float
const shares = Money.allocate(Money.add(price, tax), [1, 1, 1]);
```

Four properties are worth knowing before you use it:

- **Currency scale is per currency.** `Money.formatAmount` and `Money.parse` use
  the currency's own exponent — two places for USD, none for JPY, three for BHD.
  Text with more places than the currency holds is rejected rather than
  truncated, because a silently dropped digit is a price that is wrong by an
  amount nobody can trace.
- **Fractional rates must be exact.** `Money.multiply` accepts a whole number
  directly but refuses a float; build anything fractional with
  `Money.rate('0.075')`, which is a ratio, not the nearest double.
- **Rounding is named.** The default is half-even, because half-up biases every
  tie in the same direction and a schedule of many ties drifts upward.
  `'half-up'` and `'trunc'` are available per call.
- **Allocation preserves the total.** `Money.allocate` hands leftover minor units
  to the earliest weights, so the parts always sum back to the original.
  Rounding each share independently turns three ways of $10.00 into $9.99.

`Money.registerCurrency` declares a unit the ISO table does not describe — a
crypto unit, a loyalty point, an internal ledger unit. Any other well-formed
three-letter code gets the ISO default of two decimal places.

## Tenant-scoped queries

`@app/backend-common-tenant-context`

The tenant discriminator comes from the ambient request scope, so a forgotten
argument becomes impossible rather than merely reviewable.

```ts
import { assertTenantScoped, tenantScopedWhere, tenantScopeFilter } from '@app/backend-common-tenant-context';

const rows = await this.repository.find(tenantScopedWhere({ status: 'active' }));
```

A filter that names a different tenant throws: overwriting it silently would
hide the bug, and honouring it would leak data. `assertTenantScoped` is the
backstop for filters built by hand, and `tenantScopeFilter` registers as a
MikroORM default filter on a tenant-owned entity so every query through it
carries the predicate.

Database-level enforcement (row-level security) is a separate opt-in; see
[Multi-tenancy capability](multi-tenancy-capability.md).

## Open catalogs

Two registries are deliberately open so a product extends them without editing
boilerplate-owned files.

**Problem types** — `registerProblemTypes` from `@app/common-problem-details`
adds product problem codes to the RFC 9457 catalog. The base
`ProblemTypeDefinitions` array stays a closed `as const` so the `ProblemTypeCode`
union remains narrow for exhaustive consumers; registration widens the runtime
registry only. A rejected extension leaves the registry exactly as it was.
`Exception({ problemType })` then builds exception classes from product codes.

**Permissions** — `@app/common-authz` composes the base permission catalog with
product extensions; see [Authorization](architecture.md) and the RBAC migration
notes in [Database Migrations](database-migrations.md).

## Where product wiring goes

Each backend app has two module files. `capabilities.generated.ts` is written by
`pnpm nrb setup` from the workspace selection and is rewritten whole every time
setup runs — a product module added there disappears on the next selection
change. The app's own root module (`<app-id>.module.ts`) imports it and is never
touched by setup, so that is where product modules, controllers, and guards
belong. The generated header says the same thing at the point of temptation.

Entities and migrations have their own seam: register entities with
`MikroOrmModule.forFeature` in the feature's persistence module, and let
`pnpm nrb g feature` add the migration to the runner's list rather than editing
it by hand.

## Verification

```bash
pnpm exec nx run @app/common-money:test
pnpm exec nx run @app/backend-common-response:test
pnpm exec nx run @app/backend-common-validation:test
pnpm exec nx run @app/backend-common-tenant-context:test
```
