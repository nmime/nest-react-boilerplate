import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface TraceSpan {
  name: string;
  attributes: Record<string, unknown>;
  startedAt: Date;
  endedAt?: Date;
  events: { name: string; attributes?: Record<string, unknown>; at: Date }[];
  error?: Error;
}

export interface TracerLike {
  startSpan(name: string, attributes?: Record<string, unknown>): TraceSpan;
  endSpan(span: TraceSpan, error?: Error): void;
  addEvent(
    span: TraceSpan,
    name: string,
    attributes?: Record<string, unknown>,
  ): void;
}

export interface OpenTelemetryEnvironment {
  NODE_ENV?: string;
  OTEL_ENABLED?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_METRICS_HEADERS?: string;
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_TRACES_HEADERS?: string;
  OTEL_METRIC_EXPORT_INTERVAL?: string;
  OTEL_SDK_DISABLED?: string;
  OTEL_SERVICE_VERSION?: string;
}

export type OpenTelemetrySdkConfig = NonNullable<
  ConstructorParameters<typeof NodeSDK>[0]
>;

export interface TelemetrySdk {
  start(): void | Promise<void>;
  shutdown(): void | Promise<void>;
}

export interface OpenTelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  enabled?: boolean;
  tracer?: TracerLike;
  env?: OpenTelemetryEnvironment;
  instrumentations?: Instrumentation[];
  sdkFactory?: (config: OpenTelemetrySdkConfig) => TelemetrySdk;
}

type OtelSpanHolder = TraceSpan & { [otelSpanSymbol]?: Span };

const DefaultMetricExportIntervalMs = 60_000;
const otelSpanSymbol = Symbol("otelSpan");

export class NoopTracer implements TracerLike {
  startSpan(name: string, attributes: Record<string, unknown> = {}): TraceSpan {
    return {
      name,
      attributes,
      startedAt: new Date(),
      events: [],
    };
  }

  endSpan(span: TraceSpan, error?: Error): void {
    span.endedAt = new Date();
    span.error = error;
  }

  addEvent(
    span: TraceSpan,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    span.events.push({ name, attributes, at: new Date() });
  }
}

class OpenTelemetryTracer implements TracerLike {
  constructor(private readonly tracer: Tracer) {}

  startSpan(name: string, attributes: Record<string, unknown> = {}): TraceSpan {
    const span: OtelSpanHolder = {
      name,
      attributes,
      startedAt: new Date(),
      events: [],
      [otelSpanSymbol]: this.tracer.startSpan(name, {
        attributes: toAttributes(attributes),
      }),
    };
    return span;
  }

  endSpan(span: TraceSpan, error?: Error): void {
    span.endedAt = new Date();
    span.error = error;
    const otelSpan = (span as OtelSpanHolder)[otelSpanSymbol];
    /* v8 ignore next -- defensive for spans created by alternate TracerLike implementations. */
    if (!otelSpan) {
      return;
    }
    if (error) {
      otelSpan.recordException(error);
      otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    otelSpan.end();
  }

  addEvent(
    span: TraceSpan,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    span.events.push({ name, attributes, at: new Date() });
    (span as OtelSpanHolder)[otelSpanSymbol]?.addEvent(
      name,
      toAttributes(attributes ?? {}),
    );
  }
}

let activeTracer: TracerLike = new NoopTracer();
let activeSdk: TelemetrySdk | undefined;

export function initOpenTelemetry(options: OpenTelemetryOptions): TracerLike {
  activeSdk = undefined;

  const env = options.env ?? process.env;
  if (!isOpenTelemetryEnabled(options, env)) {
    activeTracer = new NoopTracer();
    return activeTracer;
  }

  if (options.tracer) {
    activeTracer = options.tracer;
    return activeTracer;
  }

  const sdkFactory =
    options.sdkFactory ??
    /* v8 ignore next -- integration path; unit tests inject a fake SDK to avoid mutating global providers. */
    ((config: OpenTelemetrySdkConfig) => new NodeSDK(config));
  const sdk = sdkFactory(createOpenTelemetrySdkConfig(options, env));
  sdk.start();
  activeSdk = sdk;
  activeTracer = new OpenTelemetryTracer(trace.getTracer(options.serviceName));
  return activeTracer;
}

export const getTracer = (): TracerLike => activeTracer;

export async function shutdownOpenTelemetry(): Promise<void> {
  const sdk = activeSdk;
  activeSdk = undefined;
  activeTracer = new NoopTracer();
  await sdk?.shutdown();
}

export async function withSpan<T>(
  name: string,
  action: (span: TraceSpan) => Promise<T> | T,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, attributes);
  try {
    const result = await action(span);
    tracer.endSpan(span);
    return result;
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    tracer.endSpan(span, error);
    throw error;
  }
}

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
      options.instrumentations ?? getNodeAutoInstrumentations(defaultInstrumentationConfig()),
  };
}

export function isOpenTelemetryEnabled(
  options: Pick<OpenTelemetryOptions, "enabled">,
  env: OpenTelemetryEnvironment = process.env,
): boolean {
  if (parseBoolean(env.OTEL_SDK_DISABLED) === true) {
    return false;
  }
  if (typeof options.enabled === "boolean") {
    return options.enabled;
  }

  const envEnabled = parseBoolean(env.OTEL_ENABLED);
  if (typeof envEnabled === "boolean") {
    return envEnabled;
  }

  return Boolean(
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  );
}

export function resolveOtlpEndpoint(
  env: OpenTelemetryEnvironment,
  signal: "traces" | "metrics",
): string | undefined {
  const signalEndpoint =
    signal === "traces"
      ? env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
      : env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  if (signalEndpoint?.trim()) {
    return signalEndpoint.trim();
  }

  const baseEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/u, "");
  return baseEndpoint ? `${baseEndpoint}/v1/${signal}` : undefined;
}

export function readOtlpHeaders(
  env: OpenTelemetryEnvironment,
  signal: "traces" | "metrics",
): Record<string, string> {
  const shared = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  const signalHeaders = parseOtlpHeaders(
    signal === "traces"
      ? env.OTEL_EXPORTER_OTLP_TRACES_HEADERS
      : env.OTEL_EXPORTER_OTLP_METRICS_HEADERS,
  );
  return { ...shared, ...signalHeaders };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return undefined;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOtlpHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        if (separatorIndex < 1) {
          return undefined;
        }
        const key = entry.slice(0, separatorIndex).trim();
        const headerValue = entry.slice(separatorIndex + 1).trim();
        return key ? [key, decodeHeaderValue(headerValue)] : undefined;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toAttributes(attributes: Record<string, unknown>): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).flatMap(([key, value]) => {
      const attribute = toAttributeValue(value);
      return attribute === undefined ? [] : [[key, attribute]];
    }),
  );
}

function toAttributeValue(value: unknown): Attributes[string] | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is string => typeof item === "string")) {
      return value;
    }
    if (value.every((item): item is number => typeof item === "number")) {
      return value;
    }
    if (value.every((item): item is boolean => typeof item === "boolean")) {
      return value;
    }
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
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
  } as unknown as Parameters<typeof getNodeAutoInstrumentations>[0];
}
