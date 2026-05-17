# Auth production roadmap

The boilerplate intentionally keeps auth small and testable. Before a real launch, decide and implement:

- refresh-token/session storage with rotation and revocation;
- password reset and email verification with signed, expiring tokens;
- account lockout or adaptive throttling;
- OAuth provider hardening and callback allowlists;
- audit events for login, logout, admin policy changes, and failed auth;
- cookie/session settings if moving away from bearer-token development flows.

Do not enable public password auth without the lifecycle above, production email delivery, rate limiting, monitoring, and tested recovery flows.
