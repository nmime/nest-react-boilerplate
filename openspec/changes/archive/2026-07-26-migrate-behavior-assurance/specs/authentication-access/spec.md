## ADDED Requirements

### Requirement: [REQ-AUTH-CREDENTIAL-003] Credential flows are fail-closed

Registration, sign-in, verification, password reset, and session creation SHALL
validate credentials and one-time artifacts before granting authenticated state.

**Evidence profile:** domain, security

**Invariants:**

- Verification and reset artifacts are scoped, expiring, and single-purpose.
- Authentication failures do not reveal whether an account exists.

**Failure behavior:**

- Invalid, expired, replayed, or mismatched credentials grant no session.

#### Scenario: Replayed verification artifact

- **WHEN** an already consumed verification artifact is submitted
- **THEN** authentication state remains unchanged

### Requirement: [REQ-AUTH-TENANT-004] Tenant and RBAC boundaries are enforced

Tenant memberships, roles, permissions, guards, and admin actions SHALL enforce
the persistent principal and selected tenant at the backend boundary.

**Evidence profile:** domain, persistence, security

**Invariants:**

- A tenant-scoped role cannot grant another tenant's resource.
- Frontend visibility is not authorization.

**Failure behavior:**

- Missing membership or permission returns a safe denial without protected data.

#### Scenario: Cross-tenant administration

- **WHEN** an administrator targets a resource outside the active tenant
- **THEN** the operation is denied and audited

### Requirement: [REQ-AUTH-IDENTITY-005] External identities are linked safely

OAuth, OIDC, Telegram, and provider identity flows SHALL bind state, return
URLs, nonces, and provider subjects to the initiating authenticated boundary.

**Evidence profile:** domain, security, journey

**Invariants:**

- Provider callbacks cannot select arbitrary return origins.
- One provider identity cannot be linked to conflicting owners silently.

**Failure behavior:**

- Invalid state, nonce, provider, subject, or return URL rejects the link.

#### Scenario: Unsafe return URL

- **WHEN** a social authentication callback carries a cross-origin return URL
- **THEN** the client and backend reject or replace it with a safe destination

### Requirement: [REQ-AUTH-PROFILE-006] User profile access respects the authenticated owner

Profile reads and updates SHALL expose only the authenticated user's allowed
fields and SHALL validate update payloads before persistence.

**Evidence profile:** domain, api

**Invariants:**

- Private credential and provider metadata is never returned as profile data.
- A user cannot update another user's profile through client-supplied identity.

**Failure behavior:**

- Invalid or unauthorized profile operations return safe Problem Details.

#### Scenario: Foreign profile update

- **WHEN** a user attempts to update another profile
- **THEN** no foreign profile data is changed

### Requirement: [REQ-AUTH-PERSISTENCE-007] Authentication persistence remains consistent

Users, sessions, accounts, tokens, tenants, roles, and permissions SHALL retain
referential integrity, deterministic migration order, and safe transaction
semantics.

**Evidence profile:** persistence, domain

**Invariants:**

- Session and token revocation is durable.
- Duplicate identity or role assignment obeys declared uniqueness.

**Failure behavior:**

- Persistence or migration failure does not leave a partially granted identity.

#### Scenario: Duplicate identity link

- **WHEN** a provider identity conflicts with an existing owner
- **THEN** the transaction fails without changing either owner

### Requirement: [REQ-AUTH-AUDIT-008] Privileged authentication changes are auditable

Administrative access changes, login analytics, security-sensitive identity
events, and authorization denials SHALL emit bounded, redacted audit evidence.

**Evidence profile:** domain, security, operations

**Invariants:**

- Audit records contain actor and action identity without secrets.
- Audit failure does not silently authorize the action.

**Failure behavior:**

- Required audit persistence failure rejects or explicitly degrades the action.

#### Scenario: Role change audit

- **WHEN** a privileged role assignment changes
- **THEN** the actor, tenant, subject, and outcome are auditable

### Requirement: [REQ-AUTH-FRONTEND-009] Authentication UI reflects backend authority

Web and native authentication, logout, social identity, profile, and TMA flows
SHALL handle loading, success, denial, expiry, and recovery without treating
client state as authority.

**Evidence profile:** domain, journey

**Invariants:**

- Logout clears local state and revokes through the backend contract.
- Expired sessions return users to a safe recoverable state.

**Failure behavior:**

- Failed auth requests expose safe actionable UI without protected content.

#### Scenario: Expired browser session

- **WHEN** the backend rejects an expired session
- **THEN** the UI clears protected state and offers a safe sign-in path
