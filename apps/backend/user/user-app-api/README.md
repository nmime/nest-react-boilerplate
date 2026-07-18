# user-app-api

## Ownership

This service composes the user-facing API runtime, shared health controller, and
user feature module. Keep reusable user behavior in `libs/backend/feature/user/**`
and shared backend infrastructure in `libs/backend/common/**`.

Committed OpenAPI review output lives in `contracts/openapi/**` and must be
regenerated from Nest controllers/DTOs, not hand edited.

## Commands

```bash
pnpm exec nx serve user-app-api
pnpm exec nx build user-app-api
pnpm exec nx run user-app-api:test
pnpm exec nx run user-app-api:e2e
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [API contracts](../../../../docs/api-contracts.md)
- [API conventions](../../../../docs/api-conventions.md)
- [Health checks](../../../../docs/operations/health-checks.md)
