# admin-app-api

Path: `apps/backend/admin/admin-app-api`
Nx project: `admin-app-api`
Package: `admin-app-api`
Runtime: NestJS API on Fastify
Default local port: `3001`

## Ownership

This service composes the admin API runtime, shared health controller, and
admin feature module. Keep reusable admin behavior in `libs/backend/feature/admin/**`
and shared backend infrastructure in `libs/backend/common/**`.

Committed OpenAPI review output lives in `contracts/openapi/**` and must be
regenerated from Nest controllers/DTOs, not hand edited.

## Commands

```bash
pnpm exec nx serve admin-app-api
pnpm exec nx build admin-app-api
pnpm exec nx run admin-app-api:test
pnpm exec nx run admin-app-api:e2e
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [API contracts](../../../../docs/api-contracts.md)
- [API conventions](../../../../docs/api-conventions.md)
- [Health checks](../../../../docs/operations/health-checks.md)
