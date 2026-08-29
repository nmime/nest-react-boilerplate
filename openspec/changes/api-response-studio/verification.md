## Evidence Policy

All requirements use mapped programmatic evidence. Cucumber is not applicable because SSRF, parser caps, database transactions, generated contracts, and responsive rendered interaction have more faithful direct boundaries.

## Requirement Evidence

| Requirement                 | Evidence                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| REQ-API-RESPONSE-STUDIO-001 | common contract/runtime tests, text validation tests, existing and extended presentation repository/controller tests |
| REQ-API-RESPONSE-STUDIO-002 | deterministic URL/DNS/redirect/fetch tests and controller RBAC tests                                                 |
| REQ-API-RESPONSE-STUDIO-003 | parser/ref/cycle/enum/cap/idempotency/deletion tests and provider repository tests                                   |
| REQ-API-RESPONSE-STUDIO-004 | transactional bulk/sync/audit/outbox/provider/API/export/history tests and generated client checks                   |
| REQ-API-RESPONSE-STUDIO-005 | admin app component/integration tests, FSD/i18n checks, and browser lane where available                             |

## Lanes

- PR: focused Vitest, build/typecheck/lint, generated freshness, spec validation, FSD, i18n, migration checks.
- Main/nightly: PostgreSQL/MongoDB component and rollback lanes.
- Runtime: authenticated browser journey and responsive/a11y proof.
