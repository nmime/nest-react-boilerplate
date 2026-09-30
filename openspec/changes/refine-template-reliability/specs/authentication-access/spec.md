## MODIFIED Requirements

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
- The stateless Telegram host resolves and updates linked users through an
  opt-in authenticated auth-service bridge. A dedicated service credential
  is accepted only by the owning auth API host's internal bridge routes and
  authenticates the trusted bot transport; no browser session or raw public
  provider ID authorizes the bridge. Missing configuration fails closed.
- The bridge tenant is server-configured. Canonical users are read from stored
  provider identities in that tenant, locale writes repeat that lookup, and
  one-time link tokens must match the configured tenant before identity mutation.
  Bridge responses contain profile identifiers and locale only, never sessions
  or credentials. Requests are bounded and redirects cannot forward credentials.
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
