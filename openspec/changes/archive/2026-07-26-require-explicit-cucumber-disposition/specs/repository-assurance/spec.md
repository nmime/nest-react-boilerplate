## MODIFIED Requirements

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
