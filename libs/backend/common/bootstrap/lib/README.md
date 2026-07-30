# @app/backend-common-bootstrap

## Purpose

Bootstraps NestJS/Fastify APIs with OpenTelemetry, request context, logging,
security headers, CORS, rate limiting, validation, response mapping, health,
and Swagger wiring. OpenTelemetry starts as the first operation after a caller
enters the bootstrap function, before environment resolution or Nest application
construction. Nest owns an awaited lifecycle provider that shuts the SDK down
after application resources are disposed.

Static imports in an application entrypoint are evaluated before the bootstrap
function can run. The helper therefore provides the earliest lifecycle point
available without changing the existing bootstrap API; a product that requires
instrumentation before any application-module import must add an explicit
runtime preload before importing its root module.

## Commands

```bash
pnpm exec nx run @app/backend-common-bootstrap:build
pnpm exec nx run @app/backend-common-bootstrap:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
