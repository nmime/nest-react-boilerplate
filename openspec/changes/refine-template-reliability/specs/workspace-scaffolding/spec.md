## MODIFIED Requirements

### Requirement: [REQ-SCAFFOLD-SELECTION-002] Workspace selection is explicit and repeatable

Setup SHALL record selected applications without inventing a default deployable,
and repeating the same selection SHALL converge without overwriting owned
product code.

**Evidence profile:** tooling, domain

**Invariants:**

- Presets expand to explicit catalog application identifiers.
- An end-to-end project selects every application required by its runtime journeys.
- In-place ownership wins over adjacent clones.
- Repository formatting leaves setup-managed manifests and generated capability modules byte-stable.
- Selected closures retain packages required by source, shared configuration,
  test environments, and renderer commands without leaking unselected apps or
  the opposite durable provider.
- Bot application selections retain Redis for replay protection independently
  of whether deployment owns the service or connects to an external instance.
- Provider-backed payments are wired only into selected durable backend hosts;
  stateless bot hosts retain their database-independent capabilities.
- Catalog-authored module expressions may vary by host. Notification consumers
  and schedulers retain durable payment and fiat services while disabling their
  customer, webhook, and public catalog HTTP controllers on those worker hosts.
- MongoDB payment wiring imports the module that binds and exports the
  storage-neutral persistence port, using the shared selected connection.
- Component-only Docker availability probes do not introduce PostgreSQL test
  helpers into a selected MongoDB production build graph.
- Managed full-stack MongoDB uses the selected port consistently for the
  server, replica-set identity, migrations, and application connection URI.

**Failure behavior:**

- Unknown application identifiers and incompatible options fail safely.

#### Scenario: Repeat setup

- **WHEN** the same application selection is applied again
- **THEN** setup converges without replacing existing owned roots

#### Scenario: Payments with a stateless bot

- **WHEN** a workspace selects payments and a stateless Telegram bot host
- **THEN** the bot's generated source and dependency closure exclude payment persistence
- **AND** selected durable hosts retain payment wiring

#### Scenario: Durable services on a notification worker

- **WHEN** setup selects payments or fiat services with a notification worker
- **THEN** the worker receives the selected provider's service and persistence wiring
- **AND** it receives no payment, webhook, or fiat HTTP controllers

#### Scenario: Fullstack compiles only selected product images

- **WHEN** a selected fullstack closure includes external infrastructure services
- **THEN** image compilation delegates to the canonical selected-image build driver
- **AND** database, cache, and object-store service names are never passed as product image names

### Requirement: [REQ-SCAFFOLD-GENERATORS-003] All ownership generators are deterministic

Application, library, feature, and setup generators SHALL produce canonical,
repeatable ownership without overwriting an existing owner. Generated
persistence and executable tests SHALL remain reachable by the production
migration and assurance contracts.

**Evidence profile:** tooling, domain

**Invariants:**

- Renderer, kind, scope, tags, aliases, and root layout remain compatible.
- Dry-run and apply use the same plan.
- Library scope and frontend layer SHALL be validated by the runtime generator
  before computing any path, tag, alias, or source string. A saturated local
  application port range SHALL fail instead of returning an occupied port.
- Vertical features target only supported HTTP API and web renderer owners.
- Generated migrations are explicitly registered with the production runner.
- Every generated executable test carries a deterministic bootstrap requirement
  marker for downstream OpenSpec ownership.
- Scaffold canaries retain finite, resource-aware timeouts per generated
  project rather than sharing one all-or-nothing process budget.
- Scaffold canaries lock the workspace, refuse existing owner roots, and remove
  only roots created by the current invocation.

**Failure behavior:**

- Invalid options, owner runtimes, migration registration contracts, collisions,
  clone-style names, and force replacement fail before generated writes.

#### Scenario: Existing owner

- **WHEN** generation targets an existing or clone-style owner
- **THEN** the generator refuses to write

#### Scenario: Invalid runtime generator input

- **WHEN** a direct library generator call supplies an invalid scope or layer, or every application port is occupied
- **THEN** it refuses before writing any generated owner

### Requirement: [REQ-SCAFFOLD-INIT-004] Product initialization preserves explicit ownership

Initialization and setup SHALL materialize the selected product identity,
applications, and capabilities repeatably without inventing a default app.

**Evidence profile:** tooling, domain

**Invariants:**

- Repeated execution converges.
- Product-owned files are not silently reset.
- Additive, replacement-preset, and interactive setup reruns SHALL retain the
  existing identity, app renames, runtime, session, tenant, product, and deployment
  namespaces unless the operator explicitly edits that namespace. A new app
  selection is not permission to reset product configuration.
- Tenant identity changes SHALL distinguish an absent PostgreSQL migration
  relation from an empty or applied ledger through safe separate queries;
  failed or ambiguous probes SHALL refuse the change.

**Failure behavior:**

- Invalid identity, selection, or environment inputs fail before mutation.

#### Scenario: Repeat initialization

- **WHEN** the same valid initialization is applied again
- **THEN** the workspace remains equivalent

#### Scenario: Adding an application to a configured product

- **WHEN** setup adds an application or changes a preset on a customized product
- **THEN** product namespaces remain byte-equivalent except for explicit operator edits

#### Scenario: Tenant change on a fresh database

- **WHEN** a reachable owned PostgreSQL database has no migration relation
- **THEN** the fresh-database probe succeeds without referencing the absent relation
- **AND** an applied ledger or failed query refuses the tenant rewrite

### Requirement: [REQ-SCAFFOLD-QUALITY-006] QA tooling reports bounded evidence

Quality, coverage, property, mutation, security, and browser tooling SHALL
distinguish executed success, planned work, explicit skips, and environment
blockers.

**Evidence profile:** tooling, operations

**Invariants:**

- A required skip cannot become a passing result.
- Reports identify their command and evidence boundary.
- External scanners receive writable report directories on a fresh checkout.
- Gitleaks scans the current source tree, including uncommitted source, with the
  native scanner's generated-output exclusions and preserves relative paths.
- External scanner reports retain complete finding records beside their summaries.
- Semgrep findings cause the security gate to fail even when a successful scan
  would otherwise return a zero exit status.
- Real-user journey, observability, and concurrency gates pass only after an
  explicitly configured authoritative argv command executes successfully.
- URL-only reachability remains canary or reliability evidence.
- External commands and request concurrency have finite validated bounds.
- Required accessibility, performance, DAST, and live-fuzz targets cannot be
  omitted to produce success. Optional omissions report an explicit skip;
  only an explicit dry run reports planned work.
- Performance samples are positive bounded integers, budgets are finite and
  positive, and Lighthouse results must meet the configured score threshold.
- Live native fuzzing sends every declared probe and request-body variant;
  all engines restrict methods to GET, HEAD, and OPTIONS unless unsafe writes
  are explicitly enabled for an owned disposable target.
- A successful SPA fallback is not sensitive-file exposure. DAST requires
  recognizable sensitive response content rather than status 200 alone.
- Local accessibility fixtures decode paths safely and enforce real filesystem
  containment, including adjacent directories, symlinks, and read failures.
- Secret-shaped strings are not exempted merely for containing fixture words;
  intentional credentials require reviewed value and path registrations.
- Property evidence exercises the actual exported contract helpers rather than
  copies of their algorithms, with positive bounded execution counts.
- Focused gates report unselected gates separately without making them skipped.
- The browser matrix includes a 320px Chromium viewport.
- Aggregate test limits constrain both Nx/Vitest and Node test-runner fan-out.
- Static e2e coverage excludes Docker-owned fullstack targets, whose provider
  browser evidence remains required through the fullstack lane.
- Browser coverage requires at least one visited route and one instrumented
  source file; skipping every entry route cannot produce an empty passing report.

**Failure behavior:**

- Missing required tooling or a failed command prevents a successful result.

#### Scenario: Required tool unavailable

- **WHEN** a required CI quality tool cannot execute
- **THEN** the gate fails or reports an explicit non-passing blocker

#### Scenario: External scanner finding

- **WHEN** Semgrep detects a finding in the selected rules
- **THEN** the security gate returns a non-zero status

#### Scenario: Fresh secret scan

- **GIVEN** the report directory does not exist
- **WHEN** Gitleaks completes a clean scan
- **THEN** its detailed report and the gate summary are preserved separately

#### Scenario: Missing required runtime target

- **WHEN** a selected required runtime quality gate has no target or no samples
- **THEN** it returns a non-passing result instead of empty success

#### Scenario: SPA fallback during sensitive-file probing

- **WHEN** a sensitive-file probe returns the application's ordinary HTML page
- **THEN** DAST does not report a credential leak without sensitive content

### Requirement: [REQ-SCAFFOLD-SAFETY-008] Git and database tooling fails safely

Git, migration, seed, restore, and environment tooling SHALL preserve repository
and data ownership through explicit ranges, validation, previews, and rollback
checks.

**Evidence profile:** tooling, persistence, security

**Invariants:**

- Destructive operations require explicit intent.
- Migration and restore checks never expose secrets in output.
- Seed commands SHALL honor the selected administrator email and display name.
  Non-local or production seeding SHALL require a non-default strong password
  independently of the chosen email, and SHALL create only the explicitly
  selected administrator rather than development demo users.
- Seed grants SHALL target only the canonical seed-owned account identifier
  and matching email. A pre-existing public account with the selected email or
  a canonical identifier bound to another email SHALL stop the transaction
  before granting administrator authority. Repeating a seed for the same
  canonical account SHALL preserve its existing credentials.
- Destructive persistence component fixtures SHALL use only containers created by the
  current fixture. Ambient database URLs and existing localhost servers SHALL
  never become fallback targets. A required component lane SHALL fail when its
  owned fixture cannot start, rather than reporting runtime proof from skipped
  or substituted persistence.
- Local runtime harnesses that grant fixture authority SHALL require an
  explicitly selected test database on loopback with a test/development
  namespace. Generic runtime URLs, another product's default database, and
  production mode SHALL never authorize fixture writes.

**Failure behavior:**

- Invalid history, migration, database, or environment state stops the command.

#### Scenario: PostgreSQL Docker archive outside the workspace

- **WHEN** an explicitly requested backup or restore uses an archive path outside the repository
- **THEN** the Docker fallback mounts the archive's parent directory at a known container path
- **AND** restore mounts the archive read-only and credentials remain outside process arguments

#### Scenario: Destructive intent missing

- **WHEN** a destructive-capable command lacks explicit apply intent
- **THEN** it performs only validation or preview

#### Scenario: Existing public account at the selected seed email

- **WHEN** an approved seed encounters a different existing account at its selected email
- **THEN** it refuses promotion and rolls back every seed write

#### Scenario: Explicit administrator on a non-local database

- **WHEN** the operator supplies the required non-local approvals and strong credential
- **THEN** seeding honors the selected identity, creates no known-password demo users, and can repeat for that same canonical account without replacing its password
