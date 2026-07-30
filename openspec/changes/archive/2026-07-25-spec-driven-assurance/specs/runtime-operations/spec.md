## ADDED Requirements

### Requirement: [REQ-RUNTIME-HEALTH-001] Runtime health is truthful and fail-safe

Health SHALL identify the app, redact internals, and never report a required
failed dependency as unconditionally healthy.

#### Scenario: Failed dependency

- **WHEN** a required dependency cannot respond
- **THEN** health reports a bounded degraded or failed state

### Requirement: [REQ-RUNTIME-RECOVERY-002] Failure and recovery procedures are executable

Concurrency, observability, backup/restore, rollback, load, and chaos checks
SHALL produce exact-revision scheduled or runtime evidence.

#### Scenario: Recovery dossier

- **WHEN** operational gates execute
- **THEN** their commands and outcomes are retained for one source revision
