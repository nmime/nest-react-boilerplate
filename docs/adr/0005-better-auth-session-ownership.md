# ADR 0005: Authentication credential and session ownership

- Status: Accepted; ownership clarification supersedes the original sole-session claim
- Date: 2026-08-04
- Updated: 2026-09-30
- Owners: @nmime

## Context

The template has two authentication credential owners. The first-party account
session runs through Fastify session storage, local principal projection, and
fresh account/RBAC guards. Better Auth owns its provider-session cookie and
verified provider context. Both persist through the selected PostgreSQL or
replica-set MongoDB infrastructure. They must not be confused with a provider's
remote Discord or Telegram login session.

## Decision

| Owner                                      | Responsibility                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-party auth and Fastify session store | Rotate the account session on authentication, persist its principal, reload active account/tenant/credential revision and effective permissions, and clear it on logout.    |
| Better Auth                                | Own provider-session issuance, cookie signing, authoritative provider-context reads, and revocation of its local provider credential.                                       |
| ExternalAuthService and provider adapters  | Validate provider responses, signed Telegram identities, Discord PKCE and consumed state, immutable link ownership, and initiating-browser or verified-interaction binding. |
| Frontend auth shell and query owners       | Keep public principal/tenant metadata, cancel and remove preceding account reads, hide private guest views, and expose retryable logout failure.                            |

Better Auth is pinned in workspace overrides. Its version is currently `1.7.6`;
dependency updates must follow the repository compatibility and security
workflow. `BETTER_AUTH_SECRET` protects Better Auth material, while the separate
session secret protects the first-party credential. PostgreSQL ORM and both
credential pools share one TLS policy; MongoDB shares the selected connection
and provider-appropriate session storage.

Browser Discord authorization retains a private random nonce in the initiating
server session and only its hash in single-use OAuth state. Link target and
tenant are captured before authorization. Signed Discord interactions resolve
their provider subject to a canonical local principal and support subject-bound
linking without creating a browser session. Telegram HTTP linking requires
authoritative verified provider context; caller-selected profile data is not
identity proof. Verified provider email can qualify for explicitly configured
administrator bootstrap. Public password registration remains ordinary.

Logout revokes both local credentials and forwards all dependency-issued
clearing cookies. Because the pinned Better Auth sign-out endpoint can suppress
storage failures, the bridge also performs an authoritative uncached session
read after sign-out. Retained sessions and unavailable storage fail the logout
response. The first-party credential and local private data are still cleared;
the UI retains a retry action and must not report success until revocation
succeeds. Logout remains reachable when the first-party principal has expired.

Service-only bot composition consumes auth services without exposing duplicate
auth HTTP routes. Bot-host identity and persistence ownership must be checked
for the selected host; a remote provider identifier never substitutes for a
local user identifier.

## Consequences

The application maintains explicit first-party session and OAuth authority
logic alongside the reviewed dependency. State hashing, expiry, atomic
consumption, PKCE, cookie clearing, tenant/account binding, and credential
revision checks have distinct source owners and evidence. A patched dependency
alone cannot establish application callback or account-cache correctness.

Revocation and database failures remain visible. Legacy OAuth states lacking
the required initiator binding fail closed and require a new authorization.
Frontend principal metadata contains no credential, raw launch data, or cookie.

## Validation

Stable requirements `REQ-AUTH-SESSION-002`, `REQ-AUTH-CREDENTIAL-003`,
`REQ-AUTH-IDENTITY-005`, `REQ-AUTH-FRONTEND-009`, and
`REQ-RUNTIME-DATABASE-008` own executable evidence in their durable v3 sidecars.
Controller/service, real Nest composition, QueryClient/UI, and owned database
fixtures exercise separate boundaries. Final exact-revision assurance and
independent review are required before merge. Local fixtures do not establish
hosted provider acceptance, physical-device behavior, or production readiness.
