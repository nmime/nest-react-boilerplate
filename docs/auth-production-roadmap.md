# Auth production gap register

The boilerplate includes a working auth foundation, but a product still owns
delivery, recovery, abuse policy, and operational acceptance. This page
separates implemented behavior from work that must be completed before a public
launch.

## Implemented foundation

- Password registration/login issues access and refresh tokens and establishes
  the request session.
- Refresh tokens are hashed, tenant-scoped, rotated, replay-detected by family,
  revocable, and persisted in PostgreSQL in production. Authentication context
  is carried across rotation so refresh cannot reset the recent-auth/step-up
  clock.
- Email-verification and password-reset token issuance/consumption primitives
  have in-memory and PostgreSQL stores, expiry indexes, and cleanup jobs.
- Better Auth provides the browser-session boundary, trusted-origin policy, and
  disabled-by-default Telegram OIDC integration. Discord OAuth and Telegram
  flows preserve state, return-URL, signed-token, account-linking, and encrypted
  provider-token invariants described in [Social Auth and Bots](social-auth-bots.md).
- Admin user/role mutations are tenant-scoped and transactionally write audit
  plus outbox records.

## Product launch gaps

The following are not complete product workflows merely because lower-level
storage or framework hooks exist:

- Wire password-reset and email-verification delivery to a real provider. The
  checked-in Better Auth reset hook logs the URL and is not production email
  delivery. Add branded templates, retry/bounce policy, and safe consume/update
  screens without exposing token values in logs.
- Choose account lockout or adaptive abuse controls beyond the shared rate
  limiter, and test distributed enforcement with the production Redis mode.
- Add product-owned audit events and monitoring for login, logout, refresh
  replay, recovery, verification, and failed-auth activity; current admin audit
  records cover admin mutations, not the entire auth lifecycle.
- Define user-facing session inventory, remote revocation, recovery, and support
  procedures if the product requires them.
- Exercise provider callback allowlists, secret rotation, outage behavior, and
  unlink/re-authentication recovery against real provider sandboxes.

Do not expose password authentication publicly until email delivery, abuse
controls, monitoring, and recovery flows are configured and tested. Production
must use `AUTH_PERSISTENCE=postgres`; the in-memory adapters are for tests and
development only.

## Admin CASL + RBAC authorization

Admin authorization is RBAC-first and CASL-derived. Roles and permission
strings remain the stored source of truth. The shared admin module maps only
catalogued admin permissions to CASL actions/resources through
`createAdminAbility`; `canAdmin`/`cannotAdmin` are thin helpers around that
ability.

Fail-closed rules:

- Admin APIs still require the `admin` role where controller metadata declares
  it.
- The `admin` role alone does not grant access; the principal must also carry
  explicit catalogued permissions allowed by the role-permission matrix.
- Admin permission strings without the `admin` role are denied on admin routes.
- Unknown `admin:*` permissions are ignored by the ability factory and rejected
  by admin access-policy mutation validation.
- `manage/all` is available only through the explicit `admin:manage:all`
  permission.
- Protected admin routes without permission metadata are denied by
  `RbacGuard`.

Frontend admin routing uses the same shared CASL-derived access policy only for
menu and route hints. Backend guards remain authoritative.
