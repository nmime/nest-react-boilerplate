## MODIFIED Requirements

### Requirement: [REQ-RUNTIME-STORAGE-007] Object and cache storage are safe

S3 and Redis adapters SHALL validate keys, namespaces, payloads, timeouts, and
failure conversion without leaking data across owners.

**Evidence profile:** domain, security

**Invariants:**

- Keys remain inside their owned namespace.
- Provider errors do not expose credentials.
- Local object-store fixtures SHALL retain object bytes and metadata within a
  private, current-user-owned root. Decoded keys, absolute paths, traversal,
  malformed encoding, and symlink components SHALL never select files outside
  that root. Fixture request bodies SHALL be bounded to 8 MiB and request logs
  SHALL omit credential values and raw message bodies.

**Failure behavior:**

- Invalid keys or unavailable storage return bounded typed failures.

#### Scenario: Bundled S3 storage authenticates real object operations

- **WHEN** the selected bundled S3 service starts from its maintained, pinned image
- **THEN** the AWS SDK adapter creates an isolated bucket and round-trips bytes and metadata through put, get, list, and delete
- **AND** invalid credentials and anonymous object writes are rejected
- **AND** storage management routes require authentication and unused gateways are disabled

#### Scenario: Escaping storage key

- **WHEN** a storage key attempts to escape its namespace
- **THEN** the adapter rejects it before provider access

#### Scenario: Local fixture path and payload rejection

- **WHEN** a loopback fixture receives an escaping or symlinked object path for get, head, put, or delete
- **THEN** it rejects the operation and leaves external sentinel bytes and metadata unchanged
- **AND** an oversized request returns a bounded failure while a valid nested object still round-trips

### Requirement: [REQ-RUNTIME-DATABASE-008] Database changes preserve integrity

PostgreSQL and MongoDB transactions, migrations, repositories, sessions, and
feature persistence SHALL preserve provider-appropriate integrity controls,
atomic failure behavior, idempotency, and tenant boundaries.

**Evidence profile:** persistence, domain

**Invariants:**

- Failed transactional writes do not expose partial durable state.
- Migration ordering, tracking, validators, constraints, and indexes remain
  deterministic for the selected provider.
- The canonical MongoDB ledger includes every shipped persistence provider,
  including payments, so runtime migration verifiers can accept a fresh database.
- PostgreSQL ORM, provider-auth, and first-party-session connections SHALL use
  one TLS policy. URI TLS mode, CA, certificate, key, and negotiation settings
  SHALL survive ORM composition; environment flags SHALL apply consistently
  when the URI does not select a policy. Explicit URI policy takes precedence
  over legacy environment defaults, and invalid TLS modes fail closed.

**Failure behavior:**

- Constraint, validation, connection, or transaction failure remains observable
  and safe.

#### Scenario: Failed transaction

- **WHEN** an operation fails before durable completion
- **THEN** the selected provider leaves no partial durable state

#### Scenario: TLS-required PostgreSQL connection

- **WHEN** a selected PostgreSQL connection requires verified TLS in its URI or environment
- **THEN** the ORM, provider-auth pool, and session pool connect with that policy and reject untrusted certificates and a plaintext-only server

#### Scenario: Explicit URI trust material

- **WHEN** an operator configures a URI CA, client certificate, or TLS negotiation mode
- **THEN** every PostgreSQL consumer retains that material and does not silently replace it with default flags

### Requirement: [REQ-RUNTIME-DELIVERY-009] Deployment artifacts are reproducible

Docker, Compose, Helm, GitOps, PM2, and single-server artifacts SHALL derive
from validated source and render deterministic, secret-safe runtime topology.

**Evidence profile:** operations, security

**Invariants:**

- Validation does not deploy.
- Frontend HTML navigation and public runtime configuration are never stored in
  browser or shared caches. Location-specific cache headers retain the complete
  security header policy, including failures. Only build-generated asset paths
  with the declared fingerprint naming convention use immutable caching.
  Frontend API proxies retain an exact HTTP/HTTPS forwarded protocol only from
  explicitly configured immediate proxy CIDRs; other senders cannot spoof it.
- Runtime stack readiness SHALL require a successfully parsed selected Compose
  configuration and observed ready containers for every selected long-running
  service. An empty container list, failed inspection, malformed state, or
  missing expected service SHALL never count as ready. One-shot jobs run and
  complete successfully before dependent services start.
- Bundled and external database modes remain explicit.
- One-shot PM2 plans initialize deployment configuration before building and
  load the emitted private secrets file for migrations and supervised processes.
  Credentials travel through the child environment, never command arguments.
  Build children exclude secrets from both configuration and inherited ambient
  variables; native managed-host and one-shot paths share the same wrapper.
- Managed native deployments configure the existing PostgreSQL role, database,
  and Redis credential before migrations. Reconfiguration never drops data.
  Selected notification worker listeners bind to loopback and participate in
  port collision detection and readiness checks. Doctor only observes runtime
  state; removal of obsolete supervised processes belongs to deployment.
  Native operator rollback instructions explicitly skip forward migrations.
- Single-server toolchain validation SHALL accept the repository's supported
  pinned pnpm major and refuse unsupported majors. Unattended bootstrap SHALL
  use the declared upstream repository rather than a placeholder owner.
- Fresh external PostgreSQL scaffolding SHALL default to verified TLS while
  preserving an existing operator-owned environment and explicit URI policy.
- Generated build outputs do not re-enter Nx source-project discovery before
  deployment artifacts are staged.
- Production apps, public hostnames, generatable secrets, Helm value-file
  order, Helm CLI pin, and Mongo image pin have one inventory in
  `scripts/delivery-inventory.mjs`.
- Helm install and upgrade apply `.helm/values.yaml`,
  `.helm/values-production.yaml`, and `.helm/values-selection.yaml` in that
  order.
- Existing-release Kubernetes preflight validates the current selected closure
  before any cluster access and uses that same ordered Helm selection for both
  rendering and server dry-run. Backup ownership follows the selected durable
  provider; provider-free selections explicitly omit database backup checks.
  Missing or stale selection cannot silently become an all-reference release.
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

#### Scenario: Frozen runtime dependency installation

- **GIVEN** an application build emits a pruned dependency lockfile
- **AND** the selected pnpm lockfile includes a separate package-manager document
- **WHEN** the runtime artifact is staged
- **THEN** it retains the selected package-manager versions and integrity metadata
- **AND** its application dependency document stays pruned to the application
- **AND** it retains the selected overrides, settings, package-extension checksum, and workspace policy
- **AND** standalone backend, SSR, and migrator installs enforce that policy with a frozen lockfile
- **AND** a frozen production install needs no lockfile reconciliation
- **AND** SSR and migrator importers contain only their declared runtime dependencies,
  including required migration tools whose selected lock entries were development dependencies
- **AND** SSR staging removes locked React Native optional-peer edges only when package metadata
  declares the peer optional, retaining required dependencies, other optional dependencies,
  selected versions, integrity metadata, workspace policy, and native application locks

#### Scenario: Canonical source dependency classification

- **GIVEN** the selected closure includes source build and test tools
- **WHEN** the Docker source layer has completed its frozen selected dependency install
- **THEN** it restores the canonical source package manifest before Nx runtime manifest generation
- **AND** that metadata restoration performs no additional dependency resolution or installation
- **AND** the generated backend runtime manifest excludes canonical development-only tools
- **AND** backend runtime locks remove optional peers for canonical development-only tools and native-only React Native only where package metadata explicitly marks them optional
- **AND** required peers, explicit runtime dependencies, production declarations, selected versions, integrity metadata, and source locks remain intact
- **AND** runtime staging retains selected exact versions and frozen policy while required migrator loaders remain explicit

#### Scenario: Bounded local image loading

- **GIVEN** the canonical driver selects multiple release images
- **WHEN** it loads images through Bake
- **THEN** sequential batches load at most two images by default
- **AND** a positive explicit batch size can lower that limit
- **AND** every batch retains the same complete selected compile union and plan
- **AND** a failed batch prevents subsequent batches from running

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
