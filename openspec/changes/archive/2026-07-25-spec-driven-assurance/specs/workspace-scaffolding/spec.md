## ADDED Requirements

### Requirement: [REQ-SCAFFOLD-OWNERSHIP-001] Generated roots declare one owner

Generators SHALL create policy-compliant canonical roots, reject collisions,
and provide required ownership guidance, targets, and tags.

#### Scenario: Cucumber acceptance project

- **WHEN** an e2e application uses the Cucumber renderer
- **THEN** it has isolated World state, typed steps, stable tags, and Nx targets

### Requirement: [REQ-SCAFFOLD-SELECTION-002] Workspace selection is explicit and repeatable

Setup SHALL record explicit application selection and SHALL converge without
overwriting owned product code.

#### Scenario: Repeat setup

- **WHEN** the same selection is applied again
- **THEN** setup converges without replacing owned roots
