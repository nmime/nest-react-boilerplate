# Repository assurance specification

## Purpose

Make repository behavior reviewable through stable requirements and independently
executed evidence instead of requiring humans to read every implementation line.

## Requirements

### Requirement: [REQ-ASSURANCE-TRACE-001] Every owned project is traceable

The repository SHALL map every Nx project to a durable capability, every
requirement to explicit evidence, and every Cucumber scenario to stable
requirement and scenario identifiers.

**Evidence profile:** acceptance, tooling, documentation, mutation

**Invariants:**

- No project, requirement, feature, or scenario may be silently orphaned.
- Evidence source files must name the requirement they verify.
- High-risk requirements must have distinct product and verification owners.

**Failure behavior:**

- Validation fails before implementation gates when traceability is incomplete.

#### Scenario: Complete repository trace

- **WHEN** the assurance model scans the workspace
- **THEN** all discovered projects and executable examples are owned

#### Scenario: Missing ownership

- **WHEN** a project or scenario lacks an evidence mapping
- **THEN** specification validation fails with the exact orphan

### Requirement: [REQ-ASSURANCE-FRESHNESS-002] Evidence is bound to one source revision

Every assurance dossier SHALL record the source commit, specification hash,
requirements, evidence lane, commands, outcomes, and execution time.

**Evidence profile:** tooling, operations

**Invariants:**

- Reports from another commit are stale and cannot authorize a release.
- PR, main, nightly, and runtime evidence remain distinct.

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

**Failure behavior:**

- Any provenance mismatch stops the release before publication.

#### Scenario: Successful CI provenance

- **WHEN** release automation receives a successful main CI workflow
- **THEN** it verifies and releases only that workflow source SHA

#### Scenario: Main moved after validation

- **WHEN** the verified SHA is no longer current main
- **THEN** release automation refuses to continue
