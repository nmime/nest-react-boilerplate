# @app/backend-common-otel

## Purpose

Configures the OpenTelemetry SDK and exposes real or no-op tracers, span
helpers, environment parsing, safe attribute normalization, and the explicit
provider-neutral HTTP, Fastify (`@fastify/otel`), NestJS, Redis, and Node-runtime
instrumentation set. Durable database instrumentation is composed by the
selected provider through its narrow flattened `-otel` entrypoint and does not
belong to this library. Generated process bootstraps initialize this
instrumentation before dynamically importing Nest or the selected database
module.

## Commands

```bash
pnpm exec nx run @app/backend-common-otel:build
pnpm exec nx run @app/backend-common-otel:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
