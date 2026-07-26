## ADDED Requirements

### Requirement: [REQ-ASSURANCE-TRACE-001] Every owned project is traceable

The repository SHALL map every Nx project to a durable capability, every
requirement to explicit evidence, and every executable example to stable IDs.

#### Scenario: Complete repository trace

- **WHEN** the assurance model scans the workspace
- **THEN** all projects, requirements, features, and scenarios are owned

### Requirement: [REQ-ASSURANCE-FRESHNESS-002] Evidence is bound to one source revision

Each dossier SHALL record its source SHA, specification hash, lane, commands,
outcomes, and timing.

#### Scenario: Exact revision evidence

- **WHEN** evidence executes
- **THEN** its dossier identifies the exact source and specification revisions

### Requirement: [REQ-ASSURANCE-RELEASE-003] Releases consume verified source only

A release SHALL use only the successful CI workflow SHA while it remains
current main and SHALL NOT create a new untested source commit.

#### Scenario: Main moved after validation

- **WHEN** a successful workflow SHA is no longer current main
- **THEN** release automation refuses publication
