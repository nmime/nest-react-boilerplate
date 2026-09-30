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

The default exporter allows bounded infrastructure and request-correlation
attributes. It omits raw URLs, query strings, headers, bodies, database
statements/parameters, and exception messages/stacks, including provider spans.
Only explicit service metadata becomes an exported resource. Automatic HTTP
names use methods and router templates rather than raw request paths. Custom
span/event payloads are omitted; keep operation names static and never put
credentials in metadata or names. Injected tracers and custom SDK factories own
their exporter policy.

## Commands

```bash
pnpm exec nx run @app/backend-common-otel:build
pnpm exec nx run @app/backend-common-otel:test
pnpm run test:otel-privacy
```

The component command uses the selected durable provider, owned ephemeral
database/Redis containers, and a local OTLP receiver. Run it for each provider
after selecting/installing that provider; a PostgreSQL run does not prove the
MongoDB driver lane.
An explicit `NRB_OTEL_PROOF_PROVIDER=postgres|mongodb` selects an isolated
maintainer proof when the full tooling workspace has both driver dependencies.
It does not change product selection or deploy an application.

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
