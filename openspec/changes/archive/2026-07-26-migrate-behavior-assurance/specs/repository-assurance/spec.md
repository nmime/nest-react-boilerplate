## ADDED Requirements

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
