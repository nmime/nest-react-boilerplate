## MODIFIED Requirements

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
