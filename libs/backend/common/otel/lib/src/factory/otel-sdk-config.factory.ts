import { type Attributes } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import type { OpenTelemetryEnvironment } from "../type/otel-environment.type";
import type {
  OpenTelemetryOptions,
  OpenTelemetrySdkConfig,
} from "../type/otel-options.type";
import { readOtlpHeaders, resolveOtlpEndpoint } from "../util/otel-env.util";

const DefaultMetricExportIntervalMs = 60_000;

export function createOpenTelemetrySdkConfig(
  options: OpenTelemetryOptions,
  env: OpenTelemetryEnvironment = process.env,
): OpenTelemetrySdkConfig {
  const resourceAttributes: Attributes = {
    [ATTR_SERVICE_NAME]: options.serviceName,
  };
  const serviceVersion = options.serviceVersion ?? env.OTEL_SERVICE_VERSION;
  const environment = options.environment ?? env.NODE_ENV;

  if (serviceVersion) {
    resourceAttributes[ATTR_SERVICE_VERSION] = serviceVersion;
  }
  if (environment) {
    resourceAttributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = environment;
  }

  return {
    resource: resourceFromAttributes(resourceAttributes),
    traceExporter: new OTLPTraceExporter({
      headers: readOtlpHeaders(env, "traces"),
      url: resolveOtlpEndpoint(env, "traces"),
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        headers: readOtlpHeaders(env, "metrics"),
        url: resolveOtlpEndpoint(env, "metrics"),
      }),
      exportIntervalMillis: readPositiveInteger(
        env.OTEL_METRIC_EXPORT_INTERVAL,
        DefaultMetricExportIntervalMs,
      ),
    }),
    instrumentations:
      options.instrumentations ??
      getNodeAutoInstrumentations(defaultInstrumentationConfig()),
  };
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultInstrumentationConfig(): Parameters<
  typeof getNodeAutoInstrumentations
>[0] {
  return {
    "@opentelemetry/instrumentation-fs": { enabled: false },
    "@opentelemetry/instrumentation-http": { enabled: true },
    "@opentelemetry/instrumentation-fastify": { enabled: true },
    "@opentelemetry/instrumentation-pg": { enabled: true },
    "@opentelemetry/instrumentation-redis": { enabled: true },
    "@opentelemetry/instrumentation-redis-4": { enabled: true },
    "@opentelemetry/instrumentation-nestjs-core": { enabled: true },
    // `as unknown as` retained: the exported InstrumentationConfigMap omits some
    // of these instrumentation keys, so `satisfies` fights the third-party types.
  } as unknown as Parameters<typeof getNodeAutoInstrumentations>[0];
}
