# Authentication and access specification

## Purpose

Keep authentication, tenant boundaries, sessions, roles, and permissions
fail-closed across backend and frontend entry points.

## Requirements

### Requirement: [REQ-AUTH-ACCESS-001] Malformed or unknown claims grant nothing

Authorization SHALL normalize untrusted role and permission claims
fail-closed. Unknown roles, malformed claim collections, and missing tenant
context MUST NOT produce permissions.

**Evidence profile:** acceptance, domain, security

**Invariants:**

- Only catalogued roles and permissions can become grants.
- Tenant-scoped access never falls back to a global principal.

**Failure behavior:**

- Invalid claims produce an empty grant set or an authorization denial.

#### Scenario: Malformed role claims

- **WHEN** a principal supplies a non-list role claim
- **THEN** the principal receives no normalized roles or permissions

#### Scenario: Unknown role

- **WHEN** a principal supplies a role outside the catalog
- **THEN** that role contributes no permissions

### Requirement: [REQ-AUTH-SESSION-002] Revoked and cross-tenant sessions are denied

Protected requests SHALL validate the persistent session and tenant context on
each access-sensitive path. Revoked, expired, disabled, or cross-tenant
sessions MUST be rejected.

**Evidence profile:** domain, persistence, security, journey

**Invariants:**

- UI state is not authority.
- Revocation takes effect at the protected backend boundary.

**Failure behavior:**

- Access fails with a safe RFC 9457 response and no protected data.

#### Scenario: Revoked persistent session

- **WHEN** a revoked session reaches a protected resource
- **THEN** access is denied even if a client still holds prior session state
