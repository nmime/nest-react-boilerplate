## Evidence Policy

The five payments projects are capability-owned by exactly three capabilities —
ordering, providers, and webhooks — because the three have distinct owners of
failure. The canonical file, target/script, lane, owner, profile, and risk
mapping lives in each durable capability's version-3 `verification.yaml`.
High-risk requirements (`REQ-PAYMENT-ORDER-001`,
`REQ-PAYMENT-PROVIDER-002`, and `REQ-PAYMENT-WEBHOOK-002`) keep independent
product and verification owners.

Evidence is current through U6. U2 replaced the shared-domain scaffold with
state-machine, money, FX, provider-port, and problem-type suites. U3 and U4
added live PostgreSQL and MongoDB persistence evidence. U5 added resolver,
health, and transport policy evidence. U6 adds raw HTTP ingress, exact RFC 9457
response coverage, replay and recovery service coverage, production
OpenTelemetry metrics, database claim-race component tests, and crash recovery.
The mock-provider full-stack journey and real provider adapter fixtures remain
planned for U7-U10 and are not claimed here.

## Requirement Evidence

| Requirement                | Current evidence through U6                                                                                                                    | Later evidence                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `REQ-PAYMENT-ORDER-001`    | shared state-machine matrix and admin override suites                                                                                          | mutation/resilience                                      |
| `REQ-PAYMENT-ORDER-002`    | payment-money and FX snapshot suites                                                                                                           | provider settlement fixtures                             |
| `REQ-PAYMENT-ORDER-003`    | shared idempotency, PostgreSQL unique/atomic component, Mongo ordered-write component                                                          | full-stack ordering journey                              |
| `REQ-PAYMENT-ORDER-004`    | transition persistence and current service behavior                                                                                            | U9 reconciler/expiry                                     |
| `REQ-PAYMENT-PROVIDER-001` | resolver registry and policy suites                                                                                                            | U7/U8 adapter registry                                   |
| `REQ-PAYMENT-PROVIDER-002` | credential boundary/problem coverage                                                                                                           | operator rotation/security evidence                      |
| `REQ-PAYMENT-PROVIDER-003` | normalized port and HTTP policy suites                                                                                                         | eight U7/U8 adapter contracts                            |
| `REQ-PAYMENT-PROVIDER-004` | provider health-state suites                                                                                                                   | runtime health probes                                    |
| `REQ-PAYMENT-PROVIDER-005` | PostgreSQL outbox component and Mongo ordered-write/crash recovery                                                                             | U9 dispatch/reconciliation                               |
| `REQ-PAYMENT-WEBHOOK-001`  | raw POST and CloudPayments raw-query HTTP fidelity; verification-before-persistence service assertions                                         | U7/U8 provider signature golden samples                  |
| `REQ-PAYMENT-WEBHOOK-002`  | HTTP 400/409/410/502/200 problem/success bodies, PostgreSQL and Mongo claim races, recovery leases, unique replay walls, transition durability | mock-provider full-stack journey                         |
| `REQ-PAYMENT-WEBHOOK-003`  | inline provider-status recheck before paid transition; transient recheck failure returns 502 and resumes                                       | U7/U8 amount/finality evidence; U9 escalation/reconciler |

## Independence Review

A webhook body is never trusted on its own. The controller preserves raw input,
the provider port verifies before receipt persistence, and a paid event requires
a separate provider-status re-fetch. PostgreSQL first claims use conflict-safe
`INSERT ... ON CONFLICT DO NOTHING` followed by a locked winner read; MongoDB
uses the unique replay index plus atomic compare-and-set recovery. Both axes keep
an authoritative `receivedAt` and renew `claimedAt` on resume, so a stale retry
has one owner and cannot immediately be double-claimed. U6 accepts at most one
normalized event per delivery; multi-event adapter output is rejected before
persistence rather than partially finalized.

## PR, Main, Nightly, and Runtime Lanes

- PR: strict OpenSpec/trace validation, focused Vitest, static tooling evidence,
  endpoint-manifest drift check, formatting, and closure validation.
- Main: PR evidence plus PostgreSQL and MongoDB component tests for changed
  persistence requirements.
- Nightly: mutation/property/resilience evidence and the later full provider
  matrix.
- Runtime: U9/U10 mock-provider full-stack scenarios against the
  repository-owned stack. Provider credentials and production telemetry remain
  release-environment evidence and are never fabricated in repository tests.

## Runtime and Environment Boundary

The U6 closure ran against fresh local PostgreSQL. A live MongoDB run was
observed during implementation, while the final post-migration rerun honestly
self-skipped after the local server became unavailable. The Mongo component
harness can also use a configured URI or Testcontainers and self-skips with an
explicit reason only when no server/runtime exists. Hosted
forge evidence occurs only after a revision is pushed; U6 does not claim it.

## Residual Risk

- U7/U8 still own provider-specific signature algorithms, realized-amount
  comparison, X-Rocket `finalizedAt` mapping, and normalized provider evidence.
- U9 owns reconciler completion, manual-queue/P1 escalation, and the outbox
  dispatcher.
- U10 owns the mock-provider full-stack acceptance journey and operational
  release evidence.

## Independent Verification Reviewer

Backend maintainers review payments evidence changes; security maintainers
review credential and signature evidence; platform operations reviews runbooks
and fail-closed runtime evidence.
