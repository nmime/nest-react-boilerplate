# auth-app-api

Path: `apps/backend/auth/auth-app-api`
Nx project: `auth-app-api`
Package: `auth-app-api`
Runtime: NestJS API on Fastify
Default local port: `3003`

## Ownership

This service composes the auth/session API runtime, shared health controller,
and auth feature module. Keep reusable auth behavior in
`libs/backend/feature/auth/**` and shared backend infrastructure in
`libs/backend/common/**`.

Committed OpenAPI review output lives in `contracts/openapi/**` and must be
regenerated from Nest controllers/DTOs, not hand edited.

## Commands

```bash
pnpm exec nx serve auth-app-api
pnpm exec nx build auth-app-api
pnpm exec nx run auth-app-api:test
pnpm exec nx run auth-app-api:e2e
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [API contracts](../../../../docs/api-contracts.md)
- [API conventions](../../../../docs/api-conventions.md)
- [Health checks](../../../../docs/operations/health-checks.md)
- [Social auth bots](../../../../docs/social-auth-bots.md)
