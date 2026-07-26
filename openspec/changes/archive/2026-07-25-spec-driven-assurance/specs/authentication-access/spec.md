## ADDED Requirements

### Requirement: [REQ-AUTH-ACCESS-001] Malformed or unknown claims grant nothing

Authorization SHALL normalize untrusted claims fail-closed and SHALL grant only
catalogued roles and permissions inside the active tenant boundary.

#### Scenario: Malformed claims

- **WHEN** a role claim is not a list
- **THEN** it grants no role or permission

### Requirement: [REQ-AUTH-SESSION-002] Revoked and cross-tenant sessions are denied

Protected paths SHALL validate persistent session and tenant state and MUST
reject revoked, expired, disabled, or cross-tenant sessions.

#### Scenario: Revoked session

- **WHEN** a revoked session reaches a protected resource
- **THEN** access is denied without protected data
