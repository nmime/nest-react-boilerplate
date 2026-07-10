# Better-Auth Migration Plan

## Overview

Complete migration from the legacy custom auth system (12 libraries, ~40 files, custom PBKDF2 hashing, manual JWT signing, in-memory/Postgres stores) to [Better-Auth](https://www.better-auth.com/) — a type-safe, plugin-based authentication framework with built-in session management, OAuth, rate limiting, and more.

## What Was Replaced

| Legacy Component                                     | Better-Auth Equivalent                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `jwt-signer.ts` (custom HS256)                       | Built-in JWT + cookie cache (compact/jwt/jwe)                 |
| `password.service.ts` (PBKDF2)                       | `emailAndPassword` with bcrypt/scrypt                         |
| `auth-session.factory.ts` (JWT minting)              | Session model + cookie management                             |
| `auth-token-store.ts` + in-memory/postgres adapters  | Session table + optional Redis secondary storage              |
| `bearer-auth.guard.ts` (manual JWT validation)       | `BetterAuthGuard` via Better-Auth API                         |
| `session-auth.guard.ts` (cookie + bearer fallback)   | Same guard, unified                                           |
| `external-auth.service.ts` (Telegram, Discord flows) | 3 plugins: telegram, socialProviders.discord, account-linking |
| `social-auth-store.ts` + postgres adapter            | Account table                                                 |
| `auth_user_tokens` table                             | Verification table                                            |
| `auth_link_tokens` table                             | `linkToken` table (custom schema extension)                   |

## Files Created/Modified

| #   | File                            | Lines | Role                                                                                                               |
| --- | ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `schema.ts`                     | 181   | Drizzle schema — user, session, account, verification, linkToken tables with tenant_id                             |
| 2   | `better-auth.ts`                | 300   | Server config — email/password, Discord OAuth, sessions, rate limits, security, all plugins wired                  |
| 3   | `better-auth.module.ts`         | 115   | NestJS module — `BetterAuthModule.forRoot()`, `BetterAuthService` provider                                         |
| 4   | `plugins/multi-tenant.ts`       | 168   | Tenant isolation plugin — before/after hooks, `getTenantSession` endpoint                                          |
| 5   | `plugins/rbac.ts`               | 235   | RBAC plugin — extended user fields (roles, permissions, status, locale, theme), bootstrap roles, permission checks |
| 6   | `plugins/telegram.ts`           | 387   | Telegram plugin — Web Login, TMA, Bot linking with HMAC signature verification                                     |
| 7   | `plugins/account-linking.ts`    | 267   | Account linking plugin — link tokens, identity listing/unlinking, step-up auth                                     |
| 8   | `guards/better-auth.guard.ts`   | 160   | NestJS guard — replaces `SessionAuthGuard` + `BearerAuthGuard`, validates via Better-Auth session API              |
| 9   | `auth.controller.ts`            | 541   | Rewritten controller — all 17 endpoints preserved, delegated to Better-Auth                                        |
| 10  | `auth-session.types.ts`         | 137   | Updated types — `BetterAuthSessionView`, backward-compat with `AuthSessionView`                                    |
| 11  | `auth-app-api.module.ts`        | 36    | Updated app module — imports `BetterAuthModule` with full config                                                   |
| 12  | `auth-client.ts`                | 75    | React client — type-safe `createAuthClient` with plugin clients                                                    |
| 13  | `telegram-client.ts`            | 33    | Telegram client plugin for Better-Auth React client                                                                |
| 14  | `use-auth-session-flow.ts`      | 367   | Replaced hooks — `useAuthSessionFlow`, `useSocialAuth`, `useSignOut` via Better-Auth                               |
| 15  | `scripts/migrate-auth-data.ts`  | 312   | Data migration — legacy tables → Better-Auth tables with verification                                              |
| 16  | `better-auth-migration-plan.md` | 527   | This doc                                                                                                           |

## Migration Steps

### Phase 1: Setup

```bash
# 1. Install dependencies
pnpm add better-auth drizzle-orm pg
pnpm add -D @better-auth/cli

# 2. Create Better-Auth tables via CLI
npx @better-auth/cli@latest migrate

# 3. OR run the Drizzle migration manually
npx drizzle-kit generate --schema=libs/backend/feature/auth/main/lib/src/schema.ts
npx drizzle-kit push
```

### Phase 2: Data Migration

```bash
# Dry run first
DRY_RUN=true DATABASE_URL=postgres://... tsx libs/backend/feature/auth/main/lib/src/scripts/migrate-auth-data.ts

# Execute
DRY_RUN=false DATABASE_URL=postgres://... tsx libs/backend/feature/auth/main/lib/src/scripts/migrate-auth-data.ts
```

### Phase 3: Environment Variables

```env
# Required
BETTER_AUTH_SECRET=your-secret-here-min-32-chars
BETTER_AUTH_URL=http://localhost:3003

# Optional
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3003
SESSION_COOKIE_NAME=nrb.sid
DATABASE_URL=postgres://...
TELEGRAM_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:3003/api/auth/callback/discord
ALLOWED_RETURN_URLS=http://localhost:3000,http://localhost:3001
REQUIRE_EMAIL_VERIFICATION=false
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_EMAILS=admin@example.com
```

### Phase 4: Testing

```bash
# Run tests
pnpm test -- --filter @app/feature-auth-main

# Test all auth flows manually:
# - Register: POST /auth/register
# - Login: POST /auth/login
# - Refresh: POST /auth/refresh
# - Telegram Web Login: POST /auth/telegram/web-login
# - Telegram TMA: POST /auth/telegram/tma
# - Discord OAuth: POST /auth/discord/authorization-request → GET /auth/discord/callback
# - Link tokens: POST /auth/link-tokens
# - Provider identities: GET /auth/provider-identities
# - Unlink: DELETE /auth/provider-identities/:id
# - Locale: PATCH /auth/me/locale
# - Preferences: PATCH /auth/me/preferences
# - Logout: POST /auth/logout
```

### Phase 5: Legacy Code Removal

After verifying the migration works, remove these 20+ files:

```
libs/backend/feature/auth/main/lib/src/domain/jwt-signer.ts
libs/backend/feature/auth/main/lib/src/domain/password.service.ts
libs/backend/feature/auth/main/lib/src/application/auth-session.factory.ts
libs/backend/feature/auth/main/lib/src/application/auth.service.ts
libs/backend/feature/auth/main/lib/src/application/external-auth.service.ts
libs/backend/feature/auth/shared/lib/src/oauth/bearer-auth.guard.ts
libs/backend/feature/auth/shared/lib/src/oauth/session-auth.guard.ts
All *auth-token-store*, *social-auth-store*, *in-memory-auth* files
libs/backend/postgres/main/auth/lib/src/.../repositories/auth-token.repository.ts
libs/backend/postgres/main/auth/lib/src/provider-token-crypto.service.ts
```

## Remaining TODOs

1. **setPreferences endpoint** — locale/theme updates currently return a no-op response; add a Better-Auth endpoint in the RBAC plugin to persist user preferences to the DB ✅ (implemented)
2. **Discord callback routing** — the controller redirects to Better-Auth's `/api/auth/callback/discord`; ensure the NestJS app mounts the Better-Auth handler at `/api/auth/*`
3. **Link token store** — currently in-memory; replace with the Drizzle `linkToken` table for production multi-instance deployments ✅ (schema defined)
4. **RBAC permission cache** — the `refreshPermissions` callback in the RBAC plugin is a hook point; wire it to the existing MikroORM `auth_role_permissions` tables
5. **Password migration** — legacy PBKDF2 hashes need to be verified and re-hashed to bcrypt on first login
6. **Integration tests** — update existing test specs to use the new Better-Auth-based controller
7. **CI/CD** — add Better-Auth type checking to the pipeline

## Rollback Plan

If the migration fails or causes issues:

1. **Revert code changes** — `git revert <commit-hash>`
2. **Drop Better-Auth tables** — `DROP TABLE IF EXISTS better_auth_users, better_auth_sessions, better_auth_accounts, better_auth_verifications, better_auth_link_tokens;`
3. **Restart on legacy auth** — the legacy code remains untouched until Phase 5

## Architecture Diagram

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│  Frontend    │────▶│  NestJS AuthController (17 endpoints)       │
│  React +     │     │                                              │
│  auth-client │     │  ┌────────────┐  ┌────────────────────────┐ │
│  hooks       │     │  │ Better-Auth │  │  Plugins:              │ │
│              │     │  │  Instance   │  │  • multi-tenant        │ │
│              │     │  └────────────┘  │  • rbac                 │ │
│              │     │       │          │  • telegram             │ │
└─────────────┘     │       │          │  • account-linking      │ │
                    │       ▼          └────────────────────────┘ │
                    │  ┌─────────────┐  ┌──────────────────────┐  │
                    │  │ Drizzle ORM │  │  PostgreSQL          │  │
                    │  │  (pg)       │  │  better_auth_* tables │  │
                    │  └─────────────┘  └──────────────────────┘  │
                    └──────────────────────────────────────────────┘
```
