# Auth production roadmap

The boilerplate intentionally keeps auth small and testable. Before a real launch, decide and implement:

- refresh-token/session storage with rotation and revocation;
- password reset and email verification with signed, expiring tokens;
- account lockout or adaptive throttling;
- OAuth provider hardening and callback allowlists;
- audit events for login, logout, admin policy changes, and failed auth;
- cookie/session settings if moving away from bearer-token development flows.

The reusable OAuth/OIDC foundation is disabled by default. When enabled by an
app, authorization starts must pass the current server-side session id; the
service stores only a hashed state value server-side, binds it to that session,
expires it with a bounded TTL, and consumes it once on callback. Product code
that passes a post-login return URL must configure an exact allowlist; no dynamic
return URL is accepted by default. This boilerplate does not yet wire an OIDC
ID-token callback exchange, so no nonce is generated or validated beyond the
enforced OAuth state check.

Do not enable public password auth without the lifecycle above, production email delivery, rate limiting, monitoring, and tested recovery flows.
