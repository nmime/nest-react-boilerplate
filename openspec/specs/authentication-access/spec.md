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
- Every protected API decides this the same way; no API admits a session another
  one would reject.

**Failure behavior:**

- Access fails with a safe RFC 9457 response and no protected data.

#### Scenario: Revoked persistent session

- **WHEN** a revoked session reaches a protected resource
- **THEN** access is denied even if a client still holds prior session state

#### Scenario: Session superseded by a credential change

- **WHEN** a session minted before a credential change reaches any protected API
- **THEN** access is denied on every one of them, not only where the credential
  was changed

### Requirement: [REQ-AUTH-CREDENTIAL-003] Credential flows are fail-closed

Registration, sign-in, verification, password reset, and session creation SHALL
validate credentials and one-time artifacts before granting authenticated state.

**Evidence profile:** domain, security

**Invariants:**

- Verification and reset artifacts are scoped, expiring, single-purpose, and globally unique by token hash.
- Verification and reset confirmation derive ownership from the persisted artifact, never a caller-provided tenant field.
- Authentication failures do not reveal whether an account exists.

**Failure behavior:**

- Invalid, expired, replayed, revoked, purpose-mismatched, or trusted-tenant-mismatched credentials grant no session.
- A legacy artifact with unknown ownership fails closed and is not repaired into the default tenant.

#### Scenario: Replayed verification artifact

- **WHEN** an already consumed verification artifact is submitted
- **THEN** authentication state remains unchanged

#### Scenario: Caller-selected token tenant

- **WHEN** confirmation carries a caller-controlled tenant different from the persisted token owner
- **THEN** the persisted token owner remains authoritative and no ownership is rewritten

### Requirement: [REQ-AUTH-TENANT-004] Tenant and RBAC boundaries are enforced

Tenant memberships, roles, permissions, guards, and admin actions SHALL enforce
the persistent principal and selected tenant at the backend boundary.

**Evidence profile:** domain, persistence, security

**Invariants:**

- A tenant-scoped role cannot grant another tenant's resource.
- Caller and target membership are checked independently against the selected tenant.
- Concurrent privileged mutations cannot remove the last active administrator with both required write permissions.
- Frontend visibility is not authorization.

**Failure behavior:**

- Missing caller or target membership or permission returns a safe denial without protected data.

#### Scenario: Cross-tenant administration

- **WHEN** either the administrator or the target is outside the active tenant
- **THEN** the operation is denied and audited

#### Scenario: Concurrent administrator demotion

- **WHEN** concurrent mutations attempt to demote the last two powerful administrators
- **THEN** the tenant keeps at least one active administrator with both required write permissions

### Requirement: [REQ-AUTH-IDENTITY-005] External identities are linked safely

OAuth, OIDC, Telegram, and provider identity flows SHALL bind state, return
URLs, nonces, and provider subjects to the initiating authenticated boundary.

**Evidence profile:** domain, security, journey

**Invariants:**

- Provider callbacks cannot select arbitrary return origins.
- Anonymous identity-link callbacks derive user and tenant ownership from a consumed, globally unique one-time token.
- Authenticated identity linking derives user and tenant ownership from the trusted principal.
- Caller-provided tenant fields cannot select identity-link ownership.
- One provider identity cannot be linked to conflicting owners silently.

**Failure behavior:**

- Invalid, expired, replayed, revoked, purpose-mismatched, or wrong-tenant link artifacts reject the link.
- Invalid state, nonce, provider, subject, or return URL rejects the link.

#### Scenario: Unsafe return URL

- **WHEN** a social authentication callback carries a cross-origin return URL
- **THEN** the client and backend reject or replace it with a safe destination

#### Scenario: Anonymous identity link

- **WHEN** an anonymous provider callback carries a valid one-time link token and a caller-controlled tenant field
- **THEN** the linked user and tenant come only from the consumed token

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
- Scheduled token cleanup does not overlap and cannot block application
  shutdown beyond its finite cleanup grace period.

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

### Requirement: [REQ-AUTH-TENANT-ISOLATION-010] Tenant isolation is enforced fail-closed

Tenant-scoped data SHALL be isolated by tenant-scoped queries: every repository
access carries its `tenant_id` predicate, and the ambient tenant scope fails
closed — a tenant-scoped request without a resolved tenant MUST be refused
rather than silently scoped to nothing.

PostgreSQL row-level security is the planned database-level enforcement, but it
MUST NOT be installed while no runtime path engages it: the application must
actually set the tenant GUC and restricted role on the connection path, and the
pools must connect as a non-`BYPASSRLS` role. Installing fail-closed policies
before that engagement exists protects nothing (superuser/`BYPASSRLS` pools
bypass them) while making every future restricted-role query return zero rows.
Policies installed without engagement SHALL be removed by reversal migrations.

**Evidence profile:** domain, persistence, security

**Invariants:**

- Every tenant-scoped repository access carries its tenant predicate.
- No unengaged fail-closed row-level-security policy remains installed.
- A tenant-scoped request without a resolved tenant fails loudly.

**Failure behavior:**

- A tenant-scoped request without a resolved tenant is refused.
- The migration set contains no policy installation without runtime engagement.

#### Scenario: Request without a resolved tenant

- **WHEN** a tenant-scoped route resolves no tenant and declares no exemption
- **THEN** the request is refused instead of running unscoped

#### Scenario: Unengaged row-level security is rolled back

- **WHEN** the migration set runs against a database with or without previously installed policies
- **THEN** no tenant isolation policy, `FORCE ROW LEVEL SECURITY` state, or restricted-role grant is installed, and any previously installed policy is dropped
