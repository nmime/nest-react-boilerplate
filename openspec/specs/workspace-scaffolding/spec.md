# Workspace scaffolding specification

## Purpose

Keep repository-owned generators repeatable, non-destructive, and immediately
compatible with ownership and verification policy.

## Requirements

### Requirement: [REQ-SCAFFOLD-OWNERSHIP-001] Generated roots declare one owner

Application, library, feature, and acceptance generators SHALL create
policy-compliant roots in the canonical layout, reject collisions, and provide
the required README, AGENTS guidance, targets, and tags.

**Evidence profile:** tooling, domain, documentation

**Invariants:**

- Existing roots are never overwritten by normal generation.
- Dry-run and apply produce the same planned file set.

**Failure behavior:**

- Invalid kinds, renderers, names, or collisions fail before writes.

#### Scenario: Cucumber acceptance project

- **WHEN** an e2e application is generated with the Cucumber renderer
- **THEN** it has isolated World state, typed steps, stable tags, and Nx targets

### Requirement: [REQ-SCAFFOLD-SELECTION-002] Workspace selection is explicit and repeatable

Setup SHALL record selected applications without inventing a default deployable,
and repeating the same selection SHALL converge without overwriting owned
product code.

**Evidence profile:** tooling, domain

**Invariants:**

- Presets expand to explicit catalog application identifiers.
- In-place ownership wins over adjacent clones.

**Failure behavior:**

- Unknown application identifiers and incompatible options fail safely.

#### Scenario: Repeat setup

- **WHEN** the same application selection is applied again
- **THEN** setup converges without replacing existing owned roots

### Requirement: [REQ-SCAFFOLD-GENERATORS-003] All ownership generators are deterministic

Application, library, feature, and setup generators SHALL produce canonical,
repeatable ownership without overwriting an existing owner.

**Evidence profile:** tooling, domain

**Invariants:**

- Renderer, kind, scope, tags, aliases, and root layout remain compatible.
- Dry-run and apply use the same plan.

**Failure behavior:**

- Invalid options, collisions, clone-style names, and force replacement fail.

#### Scenario: Existing owner

- **WHEN** generation targets an existing or clone-style owner
- **THEN** the generator refuses to write

### Requirement: [REQ-SCAFFOLD-INIT-004] Product initialization preserves explicit ownership

Initialization and setup SHALL materialize the selected product identity,
applications, and capabilities repeatably without inventing a default app.

**Evidence profile:** tooling, domain

**Invariants:**

- Repeated execution converges.
- Product-owned files are not silently reset.

**Failure behavior:**

- Invalid identity, selection, or environment inputs fail before mutation.

#### Scenario: Repeat initialization

- **WHEN** the same valid initialization is applied again
- **THEN** the workspace remains equivalent

### Requirement: [REQ-SCAFFOLD-TOOLING-005] Repository commands are safe and deterministic

Repository-owned CLI commands SHALL validate targets and inputs, remain
offline-capable where documented, and avoid hidden mutation or network effects.

**Evidence profile:** tooling, domain

**Invariants:**

- Public root scripts remain thin stable entrypoints.
- Mutating commands provide explicit apply intent and bounded targets.

**Failure behavior:**

- Ambiguous paths, unsafe targets, or unsupported options return non-zero.

#### Scenario: Unsafe repository command

- **WHEN** a command receives an escaping or ambiguous target
- **THEN** it rejects the request without writing outside its owner

### Requirement: [REQ-SCAFFOLD-QUALITY-006] QA tooling reports bounded evidence

Quality, coverage, property, mutation, security, and browser tooling SHALL
distinguish executed success, planned work, explicit skips, and environment
blockers.

**Evidence profile:** tooling, operations

**Invariants:**

- A required skip cannot become a passing result.
- Reports identify their command and evidence boundary.

**Failure behavior:**

- Missing required tooling or a failed command prevents a successful result.

#### Scenario: Required tool unavailable

- **WHEN** a required CI quality tool cannot execute
- **THEN** the gate fails or reports an explicit non-passing blocker

### Requirement: [REQ-SCAFFOLD-AGENTS-007] Agent skills are valid and discoverable

Every repo-local skill SHALL satisfy the package contract, appear in the skill
catalog and workflow selector, and point to current repository sources.

**Evidence profile:** tooling, documentation

**Invariants:**

- Skill metadata, default prompts, and referenced files remain synchronized.
- Behavior-changing skills include the specification lifecycle.

**Failure behavior:**

- Missing metadata, discovery, references, or lifecycle routing fails validation.

#### Scenario: Undiscoverable skill

- **WHEN** a skill is absent from either canonical discovery route
- **THEN** agent skill validation rejects it

### Requirement: [REQ-SCAFFOLD-SAFETY-008] Git and database tooling fails safely

Git, migration, seed, restore, and environment tooling SHALL preserve repository
and data ownership through explicit ranges, validation, previews, and rollback
checks.

**Evidence profile:** tooling, persistence, security

**Invariants:**

- Destructive operations require explicit intent.
- Migration and restore checks never expose secrets in output.

**Failure behavior:**

- Invalid history, migration, database, or environment state stops the command.

#### Scenario: Destructive intent missing

- **WHEN** a destructive-capable command lacks explicit apply intent
- **THEN** it performs only validation or preview
