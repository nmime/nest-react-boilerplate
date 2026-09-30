# Design

## Context

Auth main owns custom Fastify sessions and a separate Better Auth provider-session bridge. The Discord host imports the complete auth HTTP tree, and browser state currently stores no initiating-browser proof. Account cache keys outlive logout invalidation.

## Goals / Non-Goals

Preserve initiator authority through callback, require verified provider identities, revoke both credential owners, and isolate account reads. Live provider enrollment, production promotion, and newly invented payment or authentication providers are outside this change.

## Decisions

1. Persist a random browser nonce in the existing server session; store only its hash in OAuth state. Do not accept the nonce from a public DTO. Callback owner and tenant come from consumed state, with conflicting current principals rejected.
2. Model the signed Discord interaction as a separate subject-bound link continuation. It requires a canonical local principal and expected verified Discord subject; callback validates that exact subject and returns a link result without a session.
3. Consume and validate any supplied link token, including when a principal is present. Capture its target before asynchronous Discord authorization; never let a callback replace that target.
4. Make verified email an explicit bootstrap input with a safe unverified default. Password registration stays ordinary regardless of allowlist configuration.
5. Add an explicit service-only auth-module composition option, used by the Discord host. Services and persistence stay in the existing owner; duplicate HTTP controllers are omitted.
6. Ask Better Auth's server API to revoke its session and return its response cookies. Forward every clearing cookie, then clear the custom session. Revocation failure cannot produce a successful logout response.
7. Cancel account reads and remove cached data when the principal changes or logout finishes; gate provider identity rendering on authenticated state. Invalidation alone is insufficient.
8. Resolve TLS once in shared PostgreSQL infrastructure using the installed node-postgres URI parser. Supply the supported pool-level `driverOptions.ssl` to MikroORM 7, and use the same policy in Better Auth and Fastify session pools. Remove TLS query keys from the forwarded connection string after resolving them so node-postgres cannot overwrite explicit trust material. URI policy precedes environment defaults; malformed modes fail closed.
9. Build seed data only after the safety guard classifies the selected database. Honor selected email/display name and exclude demos outside local development. Require canonical identifier/email agreement before role grants, including a post-insert race check; a competing public registration aborts the transaction. Repeated canonical seeding preserves passwords.
10. Give each notification fixture run a private temporary state directory. Decode object keys once, reject invalid segments, and check existing object and metadata components for symlinks before any filesystem operation. Keep newly created directories private; limit bodies to 8 MiB and record body size/hash rather than message or credential values. Expose an owned start/close seam so real loopback HTTP regressions can use ephemeral ports and isolated sentinels.

## Risks / Trade-offs

- Legacy OAuth states fail closed after the new binding requirement. Restart authorization to recover.
- Provider revocation failure prevents a success claim. The UI clears private local data and exposes retryable failure.
- Bot actors without an existing local mapping must use the browser link journey; treating a provider snowflake as a local UUID is not a fallback.

## Migration Plan

Regenerate source-owned HTTP contracts after implementation. Validate both durable providers and browser/session fixtures at the final gate. No production write is authorized by this change.

## Open Questions

Final runtime evidence and independent assurance review are pending execution; external provider acceptance remains explicitly unverified.
