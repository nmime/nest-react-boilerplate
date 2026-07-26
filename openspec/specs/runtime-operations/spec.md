# Runtime operations specification

## Purpose

Make infrastructure dependencies, health, telemetry, shutdown, recovery, and
degraded behavior explicit and continuously provable.

## Requirements

### Requirement: [REQ-RUNTIME-HEALTH-001] Runtime health is truthful and fail-safe

Health endpoints and dependency indicators SHALL identify the running app,
redact internals, distinguish degraded from failed state, and never report a
required failed dependency as healthy.

**Evidence profile:** domain, operations

**Invariants:**

- Health output contains no secret configuration.
- Shutdown and readiness reflect dependency lifecycle.

**Failure behavior:**

- Dependency failure produces a bounded unhealthy or degraded result.

#### Scenario: Failed required dependency

- **WHEN** a required runtime dependency cannot respond
- **THEN** health does not report an unconditional healthy state

### Requirement: [REQ-RUNTIME-RECOVERY-002] Failure and recovery procedures are executable

Concurrency, observability, backup/restore, migration rollback, load, and chaos
checks SHALL execute on scheduled or runtime lanes and produce exact-revision
evidence.

**Evidence profile:** async, persistence, operations

**Invariants:**

- Dry-run proof is identified as planned, never as executed recovery.
- Environment blockers are reported separately from code failures.

**Failure behavior:**

- A failed drill or unavailable required environment prevents runtime readiness.

#### Scenario: Recovery dossier

- **WHEN** scheduled operational gates execute
- **THEN** their commands and outcomes are retained against one source revision
