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
