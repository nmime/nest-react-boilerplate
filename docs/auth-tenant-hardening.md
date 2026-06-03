# Auth and tenant hardening foundation

This template now includes scaffolding for production auth and multi-tenant lifecycle work without forcing a full SaaS implementation into new projects.

## Tenant model

Postgres migrations create:

- `auth_tenants` with slug/domain/status.
- `auth_tenant_memberships` for user membership and tenant roles.
- `auth_tenant_invitations` with hashed invitation tokens and expiry.

Existing `auth_users` remain tenant-scoped by `tenant_id`; the default tenant id is `00000000-0000-0000-0000-000000000000` for single-tenant starter apps.

HTTP tenant helpers live in `@app/feature-auth-shared`:

- `x-tenant-id` / `x-nrb-tenant-id` are authoritative when present.
- `x-tenant-domain` / `x-nrb-tenant-domain` and `Host` are normalized as domain hints for future tenant lookup.
- bearer/session guards reject a request when the requested tenant id does not match the authenticated principal.

## Token foundations

The auth feature includes an injectable token store interface plus an in-memory implementation for tests/templates:

- refresh-token issue, rotate, replay denial, and revocation hooks;
- email verification token issue/consume hooks;
- password reset token issue/consume hooks.

Postgres tables are migrated for durable storage (`auth_refresh_tokens`, `auth_user_tokens`) so projects can add a repository-backed token store without changing API/service call sites.

`AuthPostgresModule` also registers `AuthTokenCleanupService`, a lightweight background interval that calls `AuthTokenRepository.cleanupExpiredTokens()` to remove expired refresh and user-action tokens. It runs hourly and once on startup by default. Runtime overrides:

- `AUTH_TOKEN_CLEANUP_ENABLED=false` disables the cleanup loop.
- `AUTH_TOKEN_CLEANUP_INTERVAL_MS=60000` changes the interval; lower values are clamped to one minute.
- `AUTH_TOKEN_CLEANUP_RUN_ON_START=false` skips the startup cleanup run.

## Safer admin bootstrap

`ADMIN_BOOTSTRAP_EMAILS` no longer grants admin by itself. Set `ADMIN_BOOTSTRAP_ENABLED=true` to opt in, and use `ADMIN_BOOTSTRAP_TENANT_IDS` when bootstrapping non-default tenants.

## Rate limiting

`@app/common/redis` exports `SharedRateLimiter`, `SHARED_RATE_LIMITER`, and `buildRateLimitKey()` for tenant-aware limits. `RedisRateLimitService` implements the interface with Redis/in-memory clients.

## Verification

Relevant tests:

```bash
pnpm nx test @app/feature-auth-shared --skip-nx-cache
pnpm nx test @app/feature-auth-main --skip-nx-cache
pnpm nx test @app/postgres-main-auth --skip-nx-cache
pnpm nx test @app/common/redis --skip-nx-cache
pnpm nx test auth-app-api --skip-nx-cache
```
