# @app/frontend-api-client

## Purpose

Wraps generated admin, auth, and user clients with typed service registries,
Better Auth and Telegram helpers, and frontend toast-rule integration.

With `loadProblemPresentationOverrides`, `ApiClientProvider` refreshes the
authenticated tenant's endpoint-response presentation overrides from
`/auth/problem-presentations`. The deployable web apps enable this outside test
mode. Loading is best-effort: request failures never block application rendering
and leave the OpenAPI-generated defaults active. `apiToastRuleCatalog` exposes
the generated admin catalog without duplicating endpoint strings in application
code.

## Commands

```bash
pnpm exec nx run @app/frontend-api-client:build
pnpm exec nx run @app/frontend-api-client:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../AGENTS.md)
- [Repository architecture](../../../../docs/architecture.md)
- [Command matrix](../../../../docs/command-matrix.md)
- [Testing](../../../../docs/testing.md)
- [Frontend FSD](../../../../docs/frontend-fsd.md)
