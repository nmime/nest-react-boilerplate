# discord-app-api

Path: `apps/backend/discord/discord-app-api`
Nx project: `discord-app-api`
Package: `discord-app-api`
Runtime: NestJS API on Fastify
Default local port: `3007`

## Ownership

This service composes Discord interaction and external-auth integration wiring.
Keep reusable Discord bot behavior in `libs/backend/feature/discord/**` and
shared auth behavior in the auth feature libraries.

## Commands

```bash
pnpm exec nx serve discord-app-api
pnpm exec nx build discord-app-api
pnpm exec nx run discord-app-api:test
```

## Docs

- [Backend app rules](../../AGENTS.md)
- [API conventions](../../../../docs/api-conventions.md)
- [Health checks](../../../../docs/operations/health-checks.md)
- [Social auth bots](../../../../docs/social-auth-bots.md)
