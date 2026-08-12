# Repository assurance specification

## Purpose

Make repository behavior reviewable through stable requirements and independently
executed evidence instead of requiring humans to read every implementation line.

## Requirements

### Requirement: [REQ-ASSURANCE-TRACE-001] Every owned project is traceable

The repository SHALL map every Nx project to a durable capability, every
requirement to explicit evidence and one Cucumber disposition, and every
Cucumber scenario to stable requirement and scenario identifiers. An
`acceptance` disposition SHALL require mapped Cucumber evidence. A
`not-applicable` disposition SHALL require a requirement-specific reason and at
least one mapped alternative evidence kind.

**Evidence profile:** acceptance, tooling, documentation, mutation

**Invariants:**

- No project, requirement, feature, scenario, or Cucumber disposition may be
  silently orphaned.
- Evidence source files must name the requirement they verify.
- `acceptance` and `not-applicable` dispositions cannot contradict profiles or
  evidence.
- Every named alternative evidence kind must exist on the same requirement.
- High-risk requirements must have distinct product and verification owners.

**Failure behavior:**

- Validation fails before implementation gates when traceability is incomplete,
  contradictory, or supported only by an unsubstantiated disposition.

#### Scenario: Complete repository trace

- **WHEN** the assurance model scans the workspace
- **THEN** all discovered projects, requirements, executable examples, and
  Cucumber dispositions are owned

#### Scenario: Missing ownership

- **WHEN** a project, scenario, or requirement disposition lacks a valid
  evidence mapping
- **THEN** specification validation fails with the exact orphan

#### Scenario: Explicit non-Cucumber evidence

- **WHEN** a requirement declares Cucumber not applicable
- **THEN** it records a concrete reason and names alternative evidence present
  on that requirement

### Requirement: [REQ-ASSURANCE-FRESHNESS-002] Evidence is bound to one source revision

Every assurance dossier SHALL record the source commit, specification hash,
requirements, evidence lane, commands, outcomes, and execution time.

**Evidence profile:** tooling, operations

**Invariants:**

- Reports from another commit are stale and cannot authorize a release.
- PR, main, nightly, and runtime evidence remain distinct.
- Repository-global source, configuration, workflow, and policy changes select
  the complete requirement inventory when no narrower project scope is safe.
- Added, modified, renamed, and deleted files participate in impact selection.

**Failure behavior:**

- A failed evidence command makes the dossier fail.

#### Scenario: Exact revision evidence

- **WHEN** the selected evidence commands pass
- **THEN** the dossier identifies the exact source SHA and specification hash

### Requirement: [REQ-ASSURANCE-RELEASE-003] Releases consume verified source only

A release SHALL run only after the required CI workflow succeeds and SHALL
checkout the exact successful workflow commit while confirming it is still the
current main revision.

**Evidence profile:** acceptance, security, operations

**Invariants:**

- Release automation never creates an untested source-code commit.
- A stale successful workflow cannot release a newer or replaced main revision.
- Every merge-blocking gate — commit conventions, specification validation,
  typecheck, and the repository-wide test sweep among them — is inventoried in
  one forge-neutral descriptor, and every configured forge renders that
  inventory. A forge that deliberately cannot run a gate records the exclusion
  and its reason in the descriptor rather than dropping the gate silently.

**Failure behavior:**

- Any provenance mismatch stops the release before publication.

#### Scenario: Successful CI provenance

- **WHEN** release automation receives a successful main CI workflow
- **THEN** it verifies and releases only that workflow source SHA

#### Scenario: Main moved after validation

- **WHEN** the verified SHA is no longer current main
- **THEN** release automation refuses to continue

### Requirement: [REQ-ASSURANCE-INVENTORY-004] Executable tests are fully traceable

The assurance model SHALL inventory every repository-owned executable test file
and SHALL require each file to name at least one existing durable requirement.

**Evidence profile:** tooling, documentation

**Invariants:**

- Trace totals distinguish project ownership, executable tests, Gherkin
  examples, requirements, and high-signal evidence references.
- Generated output, fixtures, snapshots, and non-executable configuration are
  not counted as executable tests.

**Failure behavior:**

- An untraced or unknown requirement reference fails validation with the file.

#### Scenario: New untraced test

- **WHEN** an executable test file is added without a durable requirement ID
- **THEN** specification validation rejects that file

### Requirement: [REQ-ASSURANCE-WORKFLOW-005] Behavior changes follow one specification lifecycle

Behavior-changing work SHALL use the repository workflows for specification,
implementation, and independent assurance review before handoff.

**Evidence profile:** tooling, documentation

**Invariants:**

- Repo-local behavior skills route agents through the specification lifecycle.
- A non-behavioral refactor can retain existing requirements and evidence.

**Failure behavior:**

- Missing skill discovery or specification routing fails agent validation.

#### Scenario: Behavior implementation workflow

- **WHEN** an agent implements new or changed product behavior
- **THEN** it starts from an approved requirement and synchronizes its evidence

### Requirement: [REQ-ASSURANCE-OWNERSHIP-006] Requirements own precise project scopes

Every durable requirement SHALL list the exact Nx projects whose behavior it
governs, and the union of requirement scopes SHALL cover every discovered
project.

**Evidence profile:** tooling

**Invariants:**

- Capability-wide project lists cannot substitute for requirement ownership.
- A project can belong to multiple requirements when behavior crosses a real
  boundary.

**Failure behavior:**

- Unknown, orphaned, or cross-owned projects fail validation.

#### Scenario: Orphaned project

- **WHEN** a project belongs to no durable requirement
- **THEN** specification validation identifies the project as orphaned
