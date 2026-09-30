## MODIFIED Requirements

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
- A bot's in-process auth dependency does not expose a second auth HTTP route
  tree. Successful logout revokes both the first-party and Better Auth local
  sessions, including when the first-party session has already expired.

**Failure behavior:**

- Access fails with a safe RFC 9457 response and no protected data.

#### Scenario: Revoked persistent session

- **WHEN** a revoked session reaches a protected resource
- **THEN** access is denied even if a client still holds prior session state

#### Scenario: Session superseded by a credential change

- **WHEN** a session minted before a credential change reaches any protected API
- **THEN** access is denied on every one of them, not only where the credential
  was changed

#### Scenario: Provider credential after logout

- **WHEN** a Telegram-bearing Better Auth session and a first-party session are
  signed out through the application logout endpoint
- **THEN** neither original credential can restore authenticated application
  state and both clearing-cookie headers reach the browser
- **AND** a failed provider-session revocation is not reported as successful logout

#### Scenario: Service-only bot composition

- **WHEN** the Discord host imports auth for signed interaction handling
- **THEN** the host exposes no imported `/auth` or `/api/auth` route tree

### Requirement: [REQ-AUTH-CREDENTIAL-003] Credential flows are fail-closed

Registration, sign-in, verification, password reset, and session creation SHALL
validate credentials and one-time artifacts before granting authenticated state.

**Evidence profile:** domain, security

**Invariants:**

- Verification and reset artifacts are scoped, expiring, single-purpose, and globally unique by token hash.
- Verification and reset confirmation derive ownership from the persisted artifact, never a caller-provided tenant field.
- Authentication failures do not reveal whether an account exists.
- Provider-token AES-GCM envelopes require a complete 16-byte authentication tag.
- Public password registration assigns ordinary user access even when the
  submitted, unverified email is on the administrator bootstrap allowlist.
- Administrator provisioning requires a trusted offline operation or verified
  provider mailbox ownership; an email string is not ownership evidence.

**Failure behavior:**

- Invalid, expired, replayed, revoked, purpose-mismatched, or trusted-tenant-mismatched credentials grant no session.
- A legacy artifact with unknown ownership fails closed and is not repaired into the default tenant.

#### Scenario: Replayed verification artifact

- **WHEN** an already consumed verification artifact is submitted
- **THEN** authentication state remains unchanged

#### Scenario: Truncated provider-token authentication tag

- **WHEN** a stored encrypted provider token carries a shortened or oversized tag
- **THEN** decryption fails before returning a token

#### Scenario: Caller-selected token tenant

- **WHEN** confirmation carries a caller-controlled tenant different from the persisted token owner
- **THEN** the persisted token owner remains authoritative and no ownership is rewritten

#### Scenario: Unverified bootstrap email

- **WHEN** a registrant submits an unused allowlisted administrator email and
  an attacker-chosen password
- **THEN** registration grants only ordinary user access

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
- Generic OAuth sign-in uses the social-provider API and callback path.
- Telegram OIDC derives its provider subject from verified `sub` claims;
  mapping local profile fields cannot redefine that identity.
- Browser OAuth state is bound to an opaque nonce in the initiating server-side
  browser session and to an immutable intended account and tenant. A changed
  callback principal never replaces that target.
- A signed Discord interaction may initiate only a link flow for its already
  mapped local account, bound to that verified Discord subject. Redemption must
  verify the same provider subject and never creates a browser login session.
- Bot identity linking derives the provider subject from authenticated bot
  handling or a verified provider session; a caller-supplied subject is not proof.
- Link tokens match the provider, purpose, tenant and intended account. A
  conflicting current principal does not override or silently ignore the token.

**Failure behavior:**

- Invalid, expired, replayed, revoked, purpose-mismatched, or wrong-tenant link artifacts reject the link.
- Invalid state, nonce, provider, subject, or return URL rejects the link.

#### Scenario: Unsafe return URL

- **WHEN** a social authentication callback carries a cross-origin return URL
- **THEN** the client and backend reject or replace it with a safe destination

#### Scenario: Telegram discovery identity

- **WHEN** Telegram OIDC returns an ID token with a valid signature, issuer, audience, and numeric subject
- **THEN** social sign-in binds the account to that verified subject
- **AND** invalid or unverifiable discovery/token identity is rejected

#### Scenario: Anonymous identity link

- **WHEN** an anonymous provider callback carries a valid one-time link token and a caller-controlled tenant field
- **THEN** the linked user and tenant come only from the consumed token

#### Scenario: Transferred browser callback

- **WHEN** a valid unconsumed Discord state is redeemed by a different browser
  session or a different authenticated account
- **THEN** the callback rejects before linking an identity or creating a session

#### Scenario: Unverified bot subject

- **WHEN** a caller submits a valid local link token and another person's
  Telegram ID without matching authenticated Telegram identity proof
- **THEN** no provider association is written

#### Scenario: Wrong-provider link token

- **WHEN** a verified Telegram identity is paired with a Discord link token
- **THEN** the association is rejected without granting either identity access

### Requirement: [REQ-AUTH-FRONTEND-009] Authentication UI reflects backend authority

The frontend session shell SHALL retain the current account and tenant as non-credential metadata. Provider identity reads SHALL use that principal as part of their cache key, cancel and remove the preceding principal's reads when it changes, and never reuse them for a guest or another account.

Web and native authentication, logout, social identity, profile, and TMA flows
SHALL handle loading, success, denial, expiry, and recovery without treating
client state as authority.

**Evidence profile:** domain, journey

**Invariants:**

- Logout clears local state and revokes through the backend contract.
- Logout cancels pending account reads and removes their cached data. Guest
  identity panels never render a prior account's provider labels or actions.
- A live account or tenant change cannot display the prior principal's cached
  sensitive data while the new principal is loading.
- Expired sessions return users to a safe recoverable state.

**Failure behavior:**

- Failed auth requests expose safe actionable UI without protected content.

#### Scenario: Expired browser session

- **WHEN** the backend rejects an expired session
- **THEN** the UI clears protected state and offers a safe sign-in path

#### Scenario: Warm identity cache after sign-out

- **WHEN** account A's linked identities are loaded, A signs out, and a guest
  visits settings in the same mounted application
- **THEN** A's identity labels and cached account data are absent
- **AND** a late account-A read cannot repopulate the signed-out cache
