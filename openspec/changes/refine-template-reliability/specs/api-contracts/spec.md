## MODIFIED Requirements

### Requirement: [REQ-API-COMPAT-002] Contract changes propagate to consumers

Public controller and DTO changes SHALL update the OpenAPI artifact, shared
contract, generated client, and consumer checks in the same source revision.

**Evidence profile:** api, tooling

**Invariants:**

- Generated artifacts are derived from canonical sources.
- Provider and consumer schemas cannot silently drift.
- Nullable response scalars retain their concrete scalar type and format in
  OpenAPI and generated clients; a TypeScript union must not become an object
  schema through decorator metadata inference.

**Failure behavior:**

- Contract or generated-client drift fails validation.

#### Scenario: Consumer compatibility

- **WHEN** the canonical API contract changes
- **THEN** provider and consumer contract gates validate the same revision
