# Adding an Auth Provider

Step-by-step guide to integrating a new authentication provider using Better Auth.

## Overview

The monorepo uses Better Auth for authentication. Providers are configured in the auth API app (`apps/backend/auth/auth-app-api`). Each provider requires:

1. Environment variables for credentials.
2. Database schema changes (if storing provider-specific fields).
3. Provider registration in the Better Auth config.
4. Product-specific callback handling.

## 1. Check existing provider support

Review `apps/backend/auth/auth-app-api/src/` for existing provider configurations and the Better Auth schema in `packages/tooling/src/commands/db/better-auth-schema.ts`.

Currently implemented providers depend on the workspace configuration. Check `.env.example` for `AUTH_*` variables.

## 2. Add environment variables

Add provider credentials to `.env.example` and the environment-specific examples:

```bash
# .env.example
AUTH_GOOGLE_CLIENT_ID=<set-from-secret-manager>
AUTH_GOOGLE_CLIENT_SECRET=<set-from-secret-manager>
AUTH_GOOGLE_CALLBACK_URL=http://localhost:3005/api/auth/callback/google
```

Do not commit real `.env` files with actual secrets.

## 3. Update the Better Auth config

Edit the auth app's Better Auth configuration:

```typescript
// apps/backend/auth/auth-app-api/src/auth/auth.config.ts
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  // ... existing config ...
  socialProviders: {
    // ... existing providers ...
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

## 4. Database migrations

If the provider stores additional fields (e.g., profile picture, display name), create a MikroORM migration:

```bash
# Generate migration:
pnpm db:migrate
```

Follow [database migration standards](../database-migrations.md): explicit `NOT NULL`, `VARCHAR` plus checks instead of enums, deterministic constraint/index names.

## 5. Product-specific callback handling

OAuth is disabled until provider-specific product code is configured. Add callback route handlers:

```typescript
// apps/backend/auth/auth-app-api/src/auth/callback.controller.ts
@Post('callback/google')
async googleCallback(@Req() req: Request, @Res() res: Response) {
  // Handle Google OAuth callback
  // Exchange code for tokens
  // Create or update user profile
  // Issue session
}
```

## 6. Session configuration

Configure session storage, refresh tokens, and password reset in the auth config:

```typescript
export const auth = betterAuth({
  database: db,
  secret: process.env.AUTH_SECRET,
  databaseProvider: 'postgres',
  // ... providers ...
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieName: 'auth-session',
    expiresIn: 30 * 24 * 60 * 60, // 30 days
  },
});
```

## 7. Configure production lifecycle

Before production, review:

- **Session storage**: in-memory (dev) vs. PostgreSQL/Redis (prod).
- **Refresh tokens**: rotation and revocation.
- **Password reset**: email delivery and token expiry.
- **Email verification**: rate limits and delivery.
- **Rate limits**: per-provider and per-endpoint.
- **Audit events**: login, logout, registration, password change.

See [Auth Production Roadmap](../auth-production-roadmap.md) for the full checklist.

## 8. Frontend integration

Update the auth client in `libs/frontend/runtime` or `libs/frontend/api-support`:

```typescript
// libs/frontend/runtime/src/auth/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.VITE_AUTH_URL,
});
```

Use the client in pages:

```tsx
import { useSession, signIn, signOut } from 'better-auth/react';

export function AuthPage() {
  const { data: session } = useSession();

  return (
    <div>
      {session ? (
        <button onClick={() => signOut()}>Sign out</button>
      ) : (
        <button onClick={() => signIn.social('google')}>Sign in with Google</button>
      )}
    </div>
  );
}
```

## 9. Tests

```typescript
// apps/backend/auth/auth-app-api/src/auth/auth.e2e.test.ts
import { describe, it, expect } from 'vitest';

describe('Google OAuth', () => {
  it('redirects to Google login', async () => {
    // Test OAuth flow
  });

  it('creates user on first login', async () => {
    // Test user creation
  });

  it('links existing user on subsequent logins', async () => {
    // Test account linking
  });
});
```

## 10. Validate

```bash
# Typecheck:
nx typecheck auth-app-api

# Lint:
nx lint auth-app-api

# Test:
nx test auth-app-api

# Migrations:
pnpm db:migrations:check

# Full validation:
pnpm run check:fast
```

## Security considerations

- Never log secrets or full environment objects.
- Keep OAuth disabled unless provider configuration is explicitly supplied.
- Use HTTPS for callback URLs in production.
- Set appropriate `Authorization` headers and secure cookie flags.
- Follow [Auth Tenant Hardening](../auth-tenant-hardening.md) for multi-tenant setups.

## Next steps

- [Auth Production Roadmap](../auth-production-roadmap.md) — full production checklist.
- [Auth Tenant Hardening](../auth-tenant-hardening.md) — multi-tenant security.
- [Social Auth and Bots](../social-auth-bots.md) — bot platform authentication patterns.
