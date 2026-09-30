# Payments scaffold

Current implementation is staged through U6: storage-neutral domain contracts,
PostgreSQL and MongoDB persistence, a provider registry/HTTP policy framework,
and receipt-first webhook ingress. The registry has no built-in provider
adapters. Eight provider adapters are planned for U7/U8; the design's VERIFIED
labels refer to reviewed upstream protocol documents, not running adapters.
The legacy customer service fails closed with 503
`payment-customer-unavailable` until U9 supplies tenant ownership, order
orchestration, and registered payment grants. HTTP guards run first: anonymous
requests receive 401 and ordinary authenticated callers, including the current
admin fixture, receive 403 because payment grants are not registered. There is
no enabled customer checkout or funded-provider acceptance.

MongoDB is a selectable persistence axis with migrations and the shared
PaymentsPersistence port. A PostgreSQL selection does not wire MongoDB, and a
MongoDB selection does not wire PostgreSQL. MongoDB payments deliberately use
ordered receipt/event/payment writes and version guards, not transactions.

## Finish the product flow

1. Implement the eight adapter contracts and signature/status fixtures in the staged U7/U8 units.
2. Implement U9 customer orchestration with tenant-scoped ownership, positive exact amounts, order-reference idempotency, and permissions in the common authorization catalog. Do not activate the legacy unscoped persistence facade.
3. Regenerate OpenAPI, shared contracts, and clients from source-owned DTOs.
4. Build the frontend flow with translated loading, error, empty, success, auth, and RBAC states.
5. Exercise U10 against an owned mock provider stack, then separately verify credentialed provider and funded acceptance where a product requires it.
