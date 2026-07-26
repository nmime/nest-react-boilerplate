# API contracts specification

## Purpose

Keep server responses, generated clients, validation, and public failures on
one explicit and backwards-reviewable contract.

## Requirements

### Requirement: [REQ-API-PROBLEM-001] Public failures are safe RFC 9457 documents

HTTP API failures SHALL use registered problem types, safe details, matching
HTTP and body status, an opaque absolute occurrence URI, and the
`application/problem+json` media type.

**Evidence profile:** acceptance, api, domain

**Invariants:**

- Internal exception messages and private metadata never become public detail.
- Problem codes and request identifiers are validated before URI construction.

**Failure behavior:**

- Invalid public identifiers are rejected rather than interpolated into a URI.

#### Scenario: Valid problem occurrence

- **WHEN** a valid request identifier is converted to an occurrence URI
- **THEN** the result is absolute and contains only its encoded opaque identifier

#### Scenario: Unsafe request identifier

- **WHEN** an invalid request identifier is supplied
- **THEN** occurrence URI construction fails

### Requirement: [REQ-API-COMPAT-002] Contract changes propagate to consumers

Public controller and DTO changes SHALL update the OpenAPI artifact, shared
contract, generated client, and consumer checks in the same source revision.

**Evidence profile:** api, tooling

**Invariants:**

- Generated artifacts are derived from canonical sources.
- Provider and consumer schemas cannot silently drift.

**Failure behavior:**

- Contract or generated-client drift fails validation.

#### Scenario: Consumer compatibility

- **WHEN** the canonical API contract changes
- **THEN** provider and consumer contract gates validate the same revision
