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

### Requirement: [REQ-RUNTIME-CONFIG-003] Runtime configuration is validated and redacted

Runtime configuration SHALL be parsed by owned schemas, reject malformed values,
and prevent secrets from entering public diagnostics.

**Evidence profile:** domain, security

**Invariants:**

- Defaults are explicit and environment-specific.
- Secret values never appear in health or validation errors.

**Failure behavior:**

- Invalid required configuration stops startup before binding a service.

#### Scenario: Malformed runtime value

- **WHEN** a required runtime value fails its schema
- **THEN** startup fails with a safe actionable diagnostic

### Requirement: [REQ-RUNTIME-LIFECYCLE-004] Processes start and stop cleanly

APIs, consumers, schedulers, and shared bootstrap utilities SHALL initialize
dependencies in order, expose truthful readiness, and shut down without
abandoning owned work.

**Evidence profile:** domain, async

**Invariants:**

- Shutdown closes listeners and owned clients.
- Background startup errors are observable.

**Failure behavior:**

- Partial initialization is cleaned up before process exit.

#### Scenario: Dependency startup failure

- **WHEN** a required dependency fails during bootstrap
- **THEN** initialized resources are closed and readiness never becomes healthy

### Requirement: [REQ-RUNTIME-OBSERVABILITY-005] Telemetry is correlated and bounded

Logging, analytics, metrics, and tracing SHALL preserve request correlation,
redaction, batching, and failure isolation.

**Evidence profile:** domain, operations

**Invariants:**

- Telemetry failure does not corrupt product state.
- Secret or credential material is never emitted.

**Failure behavior:**

- Export failures are observable and bounded without recursive failure.

#### Scenario: Telemetry exporter unavailable

- **WHEN** an exporter cannot accept telemetry
- **THEN** product execution remains bounded and the failure is observable

### Requirement: [REQ-RUNTIME-MESSAGING-006] Messaging preserves delivery semantics

NATS, Redis, WebSocket, consumer, and scheduler boundaries SHALL implement
explicit connection, retry, acknowledgment, idempotency, and shutdown behavior.

**Evidence profile:** async, operations

**Invariants:**

- Duplicate delivery cannot create an untracked duplicate side effect.
- Disconnected clients cannot be reported as ready.

**Failure behavior:**

- Connection or acknowledgment failure follows a bounded retry or rejection path.

#### Scenario: Duplicate message

- **WHEN** an already handled message is delivered again
- **THEN** processing preserves the declared idempotency boundary

### Requirement: [REQ-RUNTIME-STORAGE-007] Object and cache storage are safe

S3 and Redis adapters SHALL validate keys, namespaces, payloads, timeouts, and
failure conversion without leaking data across owners.

**Evidence profile:** domain, security

**Invariants:**

- Keys remain inside their owned namespace.
- Provider errors do not expose credentials.

**Failure behavior:**

- Invalid keys or unavailable storage return bounded typed failures.

#### Scenario: Escaping storage key

- **WHEN** a storage key attempts to escape its namespace
- **THEN** the adapter rejects it before provider access

### Requirement: [REQ-RUNTIME-DATABASE-008] Database changes preserve integrity

PostgreSQL and MongoDB transactions, migrations, repositories, sessions, and
feature persistence SHALL preserve provider-appropriate integrity controls,
atomic failure behavior, idempotency, and tenant boundaries.

**Evidence profile:** persistence, domain

**Invariants:**

- Failed transactional writes do not expose partial durable state.
- Migration ordering, tracking, validators, constraints, and indexes remain
  deterministic for the selected provider.

**Failure behavior:**

- Constraint, validation, connection, or transaction failure remains observable
  and safe.

#### Scenario: Failed transaction

- **WHEN** an operation fails before durable completion
- **THEN** the selected provider leaves no partial durable state

### Requirement: [REQ-RUNTIME-DELIVERY-009] Deployment artifacts are reproducible

Docker, Compose, Helm, GitOps, PM2, and single-server artifacts SHALL derive
from validated source and render deterministic, secret-safe runtime topology.

**Evidence profile:** operations, security

**Invariants:**

- Validation does not deploy.
- Bundled and external database modes remain explicit.
- Generated build outputs do not re-enter Nx source-project discovery before
  deployment artifacts are staged.
- Production apps, public hostnames, generatable secrets, Helm value-file
  order, Helm CLI pin, and Mongo image pin have one inventory in
  `scripts/delivery-inventory.mjs`.
- Helm install and upgrade apply `.helm/values.yaml`,
  `.helm/values-production.yaml`, and `.helm/values-selection.yaml` in that
  order.
- Image promotion uses `scripts/update-deploy-tags.mjs` only.
- Product images compile only through Bake (`scripts/build-images.mjs`) when
  `NRB_IMAGE_COMPILE=1`. Merge CI, Compose up, and one-VPS deploy start with
  `--no-build` and do not bake.
- The Dockerfile `builder` compile `RUN` SHALL depend only on the shared
  `NX_BUILD_PROJECTS` union (or the compose `NX_PROJECT` fallback). It SHALL
  NOT declare or expand per-image `RUNTIME_PROJECT`, `BUILD_OUTPUT`, or
  `FRONTEND_OUTPUT` so BuildKit reuses one compile layer across Bake targets.
- A read-only SSH host probe (`scripts/verify-single-server-ssh.mjs`) SHALL
  inspect a one-VPS compose host without deploying, printing secrets, or
  running Bake on that host.

**Failure behavior:**

- Missing tools, invalid manifests, or unsafe secret placement blocks readiness.

#### Scenario: Deployment validation

- **WHEN** the supported deployment profiles are rendered
- **THEN** each produces a valid topology without publishing or deploying it

#### Scenario: Shared delivery inventory

- **WHEN** Compose, Helm, and image promotion render a selected product
- **THEN** they use one app, hostname, secret, Helm, and Mongo inventory and
  Helm applies the selection overlay last

#### Scenario: Single image compile

- **WHEN** product images are compiled for Compose, smoke, fullstack, or CI
- **THEN** Bake builds them once with a shared `NX_BUILD_PROJECTS` union and
  Compose starts the loaded images without compiling again

#### Scenario: Shared builder layer

- **WHEN** Bake compiles two application images from the same selected closure
- **THEN** their Dockerfile builder compile step does not take a per-image
  `RUNTIME_PROJECT` argument

#### Scenario: SSH thin-host probe

- **WHEN** an operator probes a one-VPS compose host over SSH
- **THEN** the probe reports architecture and Docker presence, refuses an
  unpinned `IMAGE_TAG=local`, warns when `COMPOSE_IMAGE_SOURCE=local` still
  pins `sha-<git-sha>`, and does not deploy or print secret values

### Requirement: [REQ-RUNTIME-BOUNDARY-010] Static and network boundaries are constrained

Static delivery, network helpers, health endpoints, and public runtime adapters
SHALL validate paths, origins, timeouts, headers, and public exposure.

**Evidence profile:** domain, security

**Invariants:**

- Files and routes cannot escape their configured roots.
- Private diagnostics remain private.

**Failure behavior:**

- Invalid path, origin, or network state is rejected safely.

#### Scenario: Static path traversal

- **WHEN** a requested path escapes the configured static root
- **THEN** delivery rejects the request without reading the escaped file
