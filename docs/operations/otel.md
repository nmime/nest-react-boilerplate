# OpenTelemetry configuration runbook

This repository ships an OpenTelemetry SDK wrapper in `libs/backend/common/otel/lib`.
The SDK uses `@opentelemetry/api` for tracing and `@opentelemetry/sdk-node` for the full pipeline.
It deliberately uses direct instrumentation packages instead of
`@opentelemetry/auto-instrumentations-node`, whose dependency graph includes
both durable database stacks and unrelated integrations.

## Environment variables

| Variable                              | Description                                                   | Default            |
| ------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `OTEL_ENABLED`                        | Enable/disable the OTel SDK                                   | `false`            |
| `OTEL_SDK_DISABLED`                   | Hard-disable the SDK (takes precedence)                       | `false`            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | Base OTLP endpoint for traces and metrics                     | (none)             |
| `OTEL_EXPORTER_OTLP_HEADERS`          | Comma-separated `key=value` headers for OTLP                  | (none)             |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | Traces-specific OTLP endpoint (overrides base + /v1/traces)   | (none)             |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`   | Traces-specific headers (overrides base)                      | (none)             |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics-specific OTLP endpoint (overrides base + /v1/metrics) | (none)             |
| `OTEL_EXPORTER_OTLP_METRICS_HEADERS`  | Metrics-specific headers (overrides base)                     | (none)             |
| `OTEL_METRIC_EXPORT_INTERVAL`         | Metric export interval in milliseconds                        | `60000`            |
| `OTEL_SERVICE_NAME`                   | Not honored — service name is fixed to the app name from code | app name from code |
| `OTEL_SERVICE_VERSION`                | Service version resource attribute                            | (none)             |

**No secrets in this file.** Header values containing credentials (e.g. API keys) should use env var injection from the platform secret manager.

## Activation behavior

The SDK activates when:

1. `OTEL_SDK_DISABLED` is not `true`, AND
2. Either `OTEL_ENABLED` is `true`, OR any OTLP endpoint is configured (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, or `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`)

If no endpoint is configured and `OTEL_ENABLED` is not explicitly set, the SDK falls back to a no-op tracer.

## What is exported

- **Traces:** HTTP/Fastify server spans, NestJS-core spans, Redis spans, and
  exactly one selected durable-provider integration. PostgreSQL composition
  adds `@opentelemetry/instrumentation-pg`; MongoDB composition adds
  `@opentelemetry/instrumentation-mongodb`. Provider-free composition adds
  neither. NATS behavior is unchanged: product code may add explicit spans with
  `withSpan`, but no unsupported NATS auto-instrumentation package is loaded.
- **Metrics:** Node.js runtime metrics and custom counters/histograms. Exported via `OTLPMetricExporter`.

`pnpm nrb setup` writes each backend app's pre-import telemetry initializer into
`capabilities.bootstrap.generated.ts`; Nest module composition remains in
`capabilities.generated.ts`. A process entrypoint statically imports only the
bootstrap initializer, registers common and selected-provider instrumentation,
and then dynamically imports the common Nest bootstrap and app module. The
provider factory comes from the narrow `@app/backend-postgres-main-otel` or
`@app/backend-mongodb-main-otel` entrypoint, neither of which evaluates a
database module or driver. Switching providers therefore changes the static Nx,
lockfile, and installed dependency graph without loading the opposite provider
or registering instrumentation after its driver.

Both signals use the OTLP protocol. Endpoint resolution appends `/v1/traces` or `/v1/metrics` to the base endpoint if signal-specific endpoints are not set.

## Prometheus and Sentry

- **Prometheus scraping** is not built into the OTel SDK layer. The Helm chart optionally provisions a `ServiceMonitor` for Prometheus Operator integration — see [observability DR runbook](observability-dr.md).
- **Sentry integration** is not provided by this repository. Add it as a
  product-owned integration with its own environment, privacy, source-map, and
  verification contract if a product chooses Sentry.

## Local development

Set in `.env.local`:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Point to a local collector (e.g. `otelcontribcol`, Jaeger all-in-one, or Zipkin) to inspect traces and metrics.
