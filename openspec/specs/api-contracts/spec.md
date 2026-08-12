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

### Requirement: [REQ-API-CONTEXT-003] Request context survives the async boundary

Request identifiers and request-scoped values SHALL propagate through the
supported asynchronous HTTP lifecycle without manual parameter threading.

**Evidence profile:** domain

**Invariants:**

- One request cannot observe another request's context.
- Invalid identifiers cannot become public occurrence URIs.

**Failure behavior:**

- Missing context produces a safe fallback or explicit internal failure.

#### Scenario: Concurrent requests

- **WHEN** two requests execute concurrently
- **THEN** each observes only its own request context

### Requirement: [REQ-API-VALIDATION-004] Input validation is typed and fail-closed

HTTP and configuration inputs SHALL be normalized and validated before domain
dispatch, with safe RFC 9457 validation failures for public requests.

**Evidence profile:** domain, api

**Invariants:**

- Rejected input cannot reach protected domain behavior.
- Validation pointers and details expose no private diagnostics.

**Failure behavior:**

- Malformed input returns a bounded client failure.

#### Scenario: Invalid DTO

- **WHEN** a request violates the declared DTO contract
- **THEN** the API rejects it before domain execution

### Requirement: [REQ-API-CLIENT-005] Browser clients preserve API safety contracts

Generated and wrapped frontend API clients SHALL preserve authentication,
request, response, and Problem Details contracts without duplicating endpoint
paths in application code.

**Evidence profile:** api, domain

**Invariants:**

- Generated clients remain source-derived.
- Browser-safe support code does not import backend-only modules.

**Failure behavior:**

- Contract drift or unsafe response handling fails client checks.

#### Scenario: Problem response

- **WHEN** a generated client receives a Problem Details response
- **THEN** the wrapper preserves its safe typed public fields

### Requirement: [REQ-API-RESPONSE-006] Response serialization is consistent

Success, error, health, static, and documented API responses SHALL preserve
status, headers, media type, redaction, and serialization invariants.

**Evidence profile:** domain, api

**Invariants:**

- HTTP status and serialized status cannot disagree.
- Internal error messages and metadata are not serialized publicly.

**Failure behavior:**

- Invalid response state is rejected or converted to a safe server failure.

#### Scenario: Error status serialization

- **WHEN** an application exception crosses the HTTP boundary
- **THEN** the response status, body status, and media type remain consistent

### Requirement: [REQ-API-MONEY-007] Monetary amounts stay exact end to end

Monetary values SHALL be carried as a whole number of a currency's minor units
with the currency alongside them, and every operation that could lose a minor
unit SHALL either name its rounding or preserve the total.

**Evidence profile:** domain

**Invariants:**

- A monetary value never passes through a binary floating-point representation,
  including the rate applied to it.
- Text conversion uses the currency's own scale, so a currency with no minor
  unit and one with three digits are both read and written correctly.
- Splitting an amount produces parts that sum back to the original exactly.

**Failure behavior:**

- Combining two currencies, reading text with more precision than the currency
  holds, and scaling by an inexact float are all rejected rather than coerced.

#### Scenario: Splitting an amount preserves the total

- **WHEN** an amount is allocated across weights that do not divide it evenly
- **THEN** the leftover minor units are distributed and the parts sum to the original
