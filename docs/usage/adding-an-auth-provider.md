# Adding an Auth Provider

Step-by-step guide to integrating a new authentication provider using Better Auth.

## Overview

The monorepo uses Better Auth for provider authorization and its database session, then projects verified provider identities into the tenant/RBAC application session. Provider implementation lives in `libs/backend/feature/auth/main/lib/src/application`; `auth-app-api` is only the deployable composition root. Each provider requires:

1. Environment variables for credentials.
2. Database schema changes (if storing provider-specific fields).
3. Provider registration in the Better Auth config.
4. Product-specific callback handling.

## 1. Check existing provider support

Start with these reference files:

- `libs/backend/feature/auth/main/lib/src/application/better-auth.ts` — Better Auth registration and security policy.
- `libs/backend/feature/auth/main/lib/src/application/telegram-oidc.ts` — generic OIDC provider with signed ID-token verification.
- `libs/backend/feature/auth/main/lib/src/application/plugins/telegram.ts` — custom Better Auth endpoint that creates a provider account and session.
- `libs/backend/feature/auth/main/lib/src/application/better-auth-telegram-session.service.ts` — guarded Better Auth-to-application identity projection.
- `packages/tooling/src/commands/db/better-auth-schema.ts` — Better Auth PostgreSQL schema managed by `pnpm db:migrate`.
- `libs/backend/postgres/main/auth/**` — tenant/RBAC auth entities, repositories, and explicit migrations.

Currently implemented providers depend on the workspace configuration. Check `.env.example` for `AUTH_*` variables.

## 2. Add environment variables

Add provider credentials to `.env.example` and the environment-specific examples:

```bash
# .env.example
AUTH_GOOGLE_CLIENT_ID=<set-from-secret-manager>
AUTH_GOOGLE_CLIENT_SECRET=<set-from-secret-manager>
AUTH_GOOGLE_CALLBACK_URL=http://localhost:3003/api/auth/callback/google
```

Do not commit real `.env` files with actual secrets.

## 3. Update the Better Auth config

For a built-in Better Auth provider, register it in `better-auth.ts`. For a generic OIDC provider, create a provider-owned module beside `telegram-oidc.ts` and register it with `genericOAuth`. Do not accept unsigned profile data or decode an ID token without verifying its signature, issuer, audience, and expiry.

```typescript
// libs/backend/feature/auth/main/lib/src/application/better-auth.ts
const opts: BetterAuthOptions = {
  // Keep the existing database, secret, trustedOrigins, account, and session policy.
  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET ?? '',
    },
  },
};
```

## 4. Database migrations

Better Auth's common provider/account fields belong in `better-auth-schema.ts`. Tenant/RBAC provider channels or provider-specific application data belong in an explicit MikroORM migration. Never use `POSTGRES_SYNCHRONIZE=true`.

```bash
# Apply the committed MikroORM migrations and idempotent Better Auth schema:
pnpm db:migrate

# Verify naming, registration, and drift:
pnpm db:migrations:check
```

Follow [database migration standards](../database-migrations.md): explicit `NOT NULL`, `VARCHAR` plus checks instead of enums, deterministic constraint/index names.

## 5. Product-specific callback handling

Better Auth owns its provider callback under `/api/auth/callback/<provider>` or `/api/auth/oauth2/callback/<provider>` for generic OAuth. Its registered callback origin must equal `BETTER_AUTH_URL` and the frontend Better Auth base (user-app in same-origin mode, auth-app-api in split-origin mode), because state/session cookies are host-scoped. Do not add a second controller that exchanges the same code. If the application needs its tenant/RBAC JWT/session, add a narrow projection route under `/auth/<provider>/session` that:

1. Reads the Better Auth cookie through the injected Better Auth instance.
2. Requires a live Better Auth session.
3. Requires the expected provider account on that same Better Auth user.
4. Passes only the verified provider subject/profile into `ExternalAuthService`.
5. Applies auto-provision/link/step-up policy and creates the application session.

```typescript
@Post('google/session')
async googleSession(@Req() request: AuthenticatedRequest) {
  const profile = await this.betterAuthGoogleSession.requireGoogleProfile(request.headers);
  return createOkResponse(await this.externalAuth.googleSession({ profile }));
}
```

## 6. Session configuration

Preserve the existing dual-session boundary:

- Better Auth stores its user, provider account, OAuth state, and session in PostgreSQL and issues its secure cookie.
- `ExternalAuthService` stores tenant-owned provider identities and issues the application access/session credentials used by the user/admin APIs.

Do not replace the existing Better Auth `database`, `account`, `secret`, state-storage, trusted-origin, or session settings with an in-memory example.

```typescript
const opts: BetterAuthOptions = {
  database,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: getTrustedOrigins(),
  account: {
    accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false },
    encryptOAuthTokens: true,
    storeStateStrategy: 'database',
  },
};
```

## 7. Configure production lifecycle

Before production, review:

- **Session storage**: PostgreSQL for Better Auth plus the repository's application-session policy.
- **Refresh tokens**: rotation and revocation.
- **Password reset**: email delivery and token expiry.
- **Email verification**: rate limits and delivery.
- **Rate limits**: per-provider and per-endpoint.
- **Audit events**: login, logout, registration, password change.

See [Auth Production Roadmap](../auth-production-roadmap.md) for the full checklist.

## 8. Frontend integration

Update the Better Auth client in `libs/frontend/api-client/lib/src/auth-client.ts`. Put provider-specific wire wrappers beside `better-auth-telegram.ts`, and expose application projection calls through the generated auth client. Feature code under `apps/frontend/app/src/features` must call those wrappers rather than hard-code transport details.

```typescript
// Provider start wrapper: always keep the callback controlled by this app.
await requestProviderAuthorization(authClient.requestOptions, {
  callbackURL: new URL('/auth/google/callback', location.origin).toString(),
});
```

The callback page then calls the provider projection route, stores the returned application session with `useAuthShellStore`, invalidates auth/profile queries, and navigates only to a safe same-origin return path. Gate the provider button with a provider-specific build-time flag so an unconfigured template never shows a dead sign-in action.

## 9. Tests

```typescript
// Provider-owned application spec
import { describe, expect, it } from 'vitest';

describe('Google OAuth', () => {
  it('redirects to Google login', async () => {
    // Assert authorization code + PKCE and the exact callback.
  });

  it('creates user on first login', async () => {
    // Verify a cryptographically signed provider token, then assert user/account/session.
  });

  it('links existing user on subsequent logins', async () => {
    // Repeat the same provider subject and assert no duplicate provider account.
  });
});
```

## 10. Validate

```bash
# Focused builds/tests:
pnpm exec nx build @app/backend-feature-auth-main
pnpm exec nx test @app/backend-feature-auth-main
pnpm exec nx build @app/frontend-api-client
pnpm exec nx test user-app

# Migrations:
pnpm db:migrations:check

# Full validation:
pnpm run check:fast
```

## Security considerations

- Never log secrets or full environment objects.
- Disable implicit email-based provider linking; require an explicit, verified link flow.
- Store OAuth state in the database, require PKCE when supported, and allow only controlled callback/return URLs.
- Verify ID-token/JWT signature, issuer, audience, expiry, algorithm, and provider subject before persistence.
- Keep OAuth disabled unless provider configuration is explicitly supplied.
- Use HTTPS for callback URLs in production.
- Set appropriate `Authorization` headers and secure cookie flags.
- Follow [Auth Tenant Hardening](../auth-tenant-hardening.md) for multi-tenant setups.

## Next steps

- [Auth Production Roadmap](../auth-production-roadmap.md) — full production checklist.
- [Auth Tenant Hardening](../auth-tenant-hardening.md) — multi-tenant security.
- [Social Auth and Bots](../social-auth-bots.md) — bot platform authentication patterns.
