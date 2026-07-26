## ADDED Requirements

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
