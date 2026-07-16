# Auth production roadmap

The boilerplate intentionally keeps auth small and testable. Before a real launch, decide and implement:

- refresh-token/session storage with rotation and revocation;
- password reset and email verification with signed, expiring tokens;
- account lockout or adaptive throttling;
- OAuth provider hardening and callback allowlists;
- audit events for login, logout, admin policy changes, and failed auth;
- cookie/session settings if moving away from bearer-token development flows.

The reusable OAuth/OIDC foundation is disabled by default. Telegram OIDC is the
reference implementation: Better Auth stores authorization state in PostgreSQL,
uses authorization code plus PKCE, verifies Telegram ID tokens against the
configured issuer, audience, expiry, algorithms, and JWKS, disables implicit
account linking, and encrypts stored OAuth tokens. Product return URLs remain
same-origin/allowlisted. New providers must preserve these invariants and add
provider-specific signed-token and callback tests before their feature flag is
enabled.

Do not enable public password auth without the lifecycle above, production email delivery, rate limiting, monitoring, and tested recovery flows.

## Admin CASL + RBAC authorization

Admin authorization is RBAC-first and CASL-derived. Roles and permission strings remain the stored/source-of-truth access policy. The shared admin module maps only catalogued admin permissions to CASL actions/resources through `createAdminAbility`; `canAdmin`/`cannotAdmin` are thin helpers around that ability.

Fail-closed rules:

- Admin APIs still require the `admin` role where controller metadata declares it.
- The `admin` role alone does not grant access; the principal must also carry explicit catalogued permissions allowed by the role-permission matrix.
- Admin permission strings without the `admin` role are denied on admin routes.
- Unknown `admin:*` permissions are ignored by the ability factory and rejected by admin access-policy mutation validation.
- `manage/all` is available only through the explicit `admin:manage:all` permission.
- Protected admin routes without permission metadata are denied by `RbacGuard`.

Frontend admin routing uses the same shared CASL-derived access policy only for menu and route hints. Backend guards remain authoritative.
