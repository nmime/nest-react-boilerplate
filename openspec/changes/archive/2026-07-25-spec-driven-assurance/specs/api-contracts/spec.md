## ADDED Requirements

### Requirement: [REQ-API-PROBLEM-001] Public failures are safe RFC 9457 documents

API failures SHALL use registered safe problem details with matching status,
safe public members, and opaque absolute occurrence identifiers.

#### Scenario: Unsafe request identifier

- **WHEN** an invalid request identifier is supplied
- **THEN** occurrence URI construction fails

### Requirement: [REQ-API-COMPAT-002] Contract changes propagate to consumers

Public API changes SHALL update canonical OpenAPI, shared contracts, generated
clients, and consumer checks in one revision.

#### Scenario: Consumer compatibility

- **WHEN** a public contract changes
- **THEN** provider and consumer gates validate the same revision
