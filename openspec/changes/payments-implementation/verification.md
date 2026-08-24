## Evidence Policy

The five payments projects are capability-owned by exactly three
capabilities — ordering, providers, webhooks — one concern per directory,
because the three have distinct owners of failure. The precise file,
target/script, lane, owner, profile, and risk mapping is canonical in each
durable capability's `verification.yaml` (version 3). High-risk
requirements (REQ-PAYMENT-ORDER-001, REQ-PAYMENT-PROVIDER-002,
REQ-PAYMENT-WEBHOOK-002) carry product owner `runtime-maintainers` and an
independent verification owner `backend-maintainers`, as required.

At this stage of the change (U1 shell) the sidecars carry scaffold-level
evidence: the module/DTO/alias suites that exist in the five generated
projects, re-pointed from the retired scaffold requirement at the owning
requirement. Units U2–U9 replace each sidecar's evidence list with the real
suites as they land (contract, component, playwright, security,
operations); every evidence `file` must exist at merge time.

## Requirement Evidence

| Requirement                | Risk   | U1 evidence (scaffold-level)                                                         | U2+ evidence owners                                                                 |
| -------------------------- | ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `REQ-PAYMENT-ORDER-001`    | high   | shared/main/admin scaffold suites + spec.md                                          | state-machine matrix vitest (shared), admin override specs                          |
| `REQ-PAYMENT-ORDER-002`    | normal | shared alias suite + spec.md                                                         | payment-money + fx-snapshot vitest (shared)                                         |
| `REQ-PAYMENT-ORDER-003`    | normal | shared port suite, main controller suite, postgres + mongo scaffold suites + spec.md | idempotency vitest, unique-index component (postgres)                               |
| `REQ-PAYMENT-ORDER-004`    | normal | main service suite, postgres entity suite + spec.md                                  | reconciler/expiry vitest + component                                                |
| `REQ-PAYMENT-PROVIDER-001` | normal | admin + postgres scaffold suites + spec.md                                           | resolver vitest (main), registry component                                          |
| `REQ-PAYMENT-PROVIDER-002` | high   | admin module suite, postgres alias suite + spec.md                                   | envelope crypto vitest (main), redaction security spec (admin)                      |
| `REQ-PAYMENT-PROVIDER-003` | normal | main alias suite + spec.md                                                           | 8 adapter contract vitest + X-Rocket spec-fixture contract test                     |
| `REQ-PAYMENT-PROVIDER-004` | normal | postgres alias suite + spec.md                                                       | health-state vitest (main)                                                          |
| `REQ-PAYMENT-PROVIDER-005` | normal | main service suite, postgres migration suite, mongo module/index suites + spec.md    | outbox component (postgres `component-test`), ordered-write component (mongo)       |
| `REQ-PAYMENT-WEBHOOK-001`  | normal | main controller suite + spec.md                                                      | per-provider signature vitest incl. Heleket/NOWPayments/Stripe/Adyen golden samples |
| `REQ-PAYMENT-WEBHOOK-002`  | high   | postgres entity suite, mongo component/collection/alias suites + spec.md             | receipt-replay component (postgres), rejection-table + redelivery vitest            |
| `REQ-PAYMENT-WEBHOOK-003`  | normal | main module suite + spec.md                                                          | double-check vitest (main), journey scenario (playwright)                           |

## Independence Review

A webhook is never trusted from its own body: verification is a separate
security boundary (raw bytes, per-provider algorithm, constant-time
compare), the transition is proven by the shared pure state-machine spec,
and the receipt wall is proven at the database constraint level. The
journey profile is proven by the fullstack-e2e Playwright suite against a
mock provider (in-repo fastify fixture serving a deterministic API and
signing webhooks per the configured scheme) at lane main — the backend-only
capabilities carry no Cucumber acceptance profile. High-risk manifests
reject identical product and verification owners at validation time.

## PR, Main, Nightly, and Runtime Lanes

- PR: OpenSpec strict + trace validation, focused Vitest for impacted
  requirements (domain), security (signature/replay) for webhook/credential
  requirements, static tooling evidence.
- Main: PR evidence plus contract (per-endpoint envelope + error codes) and
  component/persistence evidence selected for changed requirements
  (`@app/backend-postgres-main-payments:component-test`,
  `@app/backend-mongodb-main-payments:component-test`), plus the
  fullstack-e2e journey (scenarios 1, 3, 4, 5 as the fast subset).
- Nightly: mutation (state machine + Heleket serializer seeds), property,
  and full component/resilience evidence.
- Runtime: fullstack-e2e scenarios 1–7 against the repository-owned stack
  with the mock provider registered in the DB; provider credentials and
  production telemetry remain release-environment evidence, never
  fabricated in the repository.

## Runtime and Environment Boundary

Container-backed component evidence self-skips where Docker is absent and
reports the explicit prerequisite; real-DB tests use local PostgreSQL.
Hosted forge executions occur only after the revision is pushed. An
unavailable external environment is never converted into a passing
source-code result.

## Residual Risk

- Provider details absent from the verified sources (rate-limit numbers,
  X-Rocket testnet trigger, Adyen reconciliation GET) are handled as
  operator onboarding tasks with golden tests pinned from staging captures
  before enablement — never assumed in code.
- RU compliance decisions are operator-owned; the repository encodes only
  the verified exclusions as row defaults and keeps X-Rocket disabled until
  written support confirmation.

## Independent Verification Reviewer

- Backend maintainers review all payments evidence changes; security
  maintainers review credential envelope and webhook signature evidence;
  platform operations reviews the runbook and fail-closed evidence.
