# payments-implementation

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
