## MODIFIED Requirements

### Requirement: [REQ-RUNTIME-RECOVERY-002] Failure and recovery procedures are executable

Concurrency, observability, backup/restore, migration rollback, load, and chaos
checks SHALL execute on scheduled or runtime lanes and produce exact-revision
evidence.

**Evidence profile:** async, persistence, operations

**Invariants:**

- Dry-run proof is identified as planned, never as executed recovery.
- Environment blockers are reported separately from code failures.
- Default recovery drills restore only into a newly owned disposable namespace
  or container, verify retained data, and clean up only their owned resources.
  They never restore an ambient backup over its source database.

**Failure behavior:**

- A failed drill or unavailable required environment prevents runtime readiness.

#### Scenario: Recovery dossier

- **WHEN** scheduled operational gates execute
- **THEN** their commands and outcomes are retained against one source revision

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
- Manual runtime assurance materializes its explicit reference provider and owns
  stack startup, readiness, and cleanup before executing runtime evidence.
  A checkout with installed browser binaries alone is not runtime proof.
- Privileged runtime fixtures are seeded through the selected provider only
  after proving ownership of the running developer Compose database and its
  loopback port. Public registration never supplies administrator authority.
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

### Requirement: [REQ-RUNTIME-OBSERVABILITY-005] Telemetry is correlated and bounded

Logging, analytics, metrics, and tracing SHALL preserve request correlation,
redaction, batching, and failure isolation.

**Evidence profile:** domain, operations

**Invariants:**

- Telemetry failure does not corrupt product state.
- Secret or credential material is never emitted.
- The default tracing exporter preserves operation timing, status, route
  templates, and bounded infrastructure/correlation metadata while omitting
  request URLs, query strings, headers, bodies, database statements/arguments,
  action payloads, and free-form exception messages/stacks. Exported resources
  use explicit service metadata rather than ambient resource attributes.
  Real automatic HTTP instrumentation evidence covers both inbound and outbound
  credential-bearing requests; manual spans alone cannot prove that boundary.
- Optional developer observability uses immutable reviewed images, only local
  listeners, and anonymous Viewer access with no initial administrator. It
  provisions only its deployed log/trace backends and requires explicit service
  profiles independently from the selected durable database. Documentation
  distinguishes backend availability from actual telemetry ingestion.

**Failure behavior:**

- Export failures are observable and bounded without recursive failure.

#### Scenario: Telemetry exporter unavailable

- **WHEN** an exporter cannot accept telemetry
- **THEN** product execution remains bounded and the failure is observable

#### Scenario: Reference monitoring stack accepts and exposes telemetry

- **WHEN** the reference monitoring stack starts from its immutable image pins
- **THEN** each native configuration parser accepts the mounted configuration
- **AND** a real OTLP metric is scraped by Prometheus and queryable through Grafana
- **AND** Grafana provisions one dashboard provider and only deployed datasources
- **AND** Alertmanager groups alerts without claiming notification delivery until real receivers are configured
- **AND** collector readiness is checked through HTTP rather than a shell absent from its image
