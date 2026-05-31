import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOpenTelemetrySdkConfig,
  getTracer,
  initOpenTelemetry,
  isOpenTelemetryEnabled,
  NoopTracer,
  readOtlpHeaders,
  resolveOtlpEndpoint,
  shutdownOpenTelemetry,
  withSpan,
  type OpenTelemetrySdkConfig,
  type TelemetrySdk,
  type TraceSpan,
  type TracerLike,
} from "./otel";

class RecordingTracer implements TracerLike {
  readonly ended: { span: TraceSpan; error?: Error }[] = [];

  startSpan(name: string, attributes: Record<string, unknown> = {}): TraceSpan {
    return { name, attributes, startedAt: new Date(), events: [] };
  }

  endSpan(span: TraceSpan, error?: Error): void {
    span.endedAt = new Date();
    span.error = error;
    this.ended.push({ span, error });
  }

  addEvent(
    span: TraceSpan,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    span.events.push({ name, attributes, at: new Date() });
  }
}

describe("OpenTelemetry bootstrap", () => {
  afterEach(async () => {
    await shutdownOpenTelemetry();
  });

  it("keeps the noop fallback when telemetry is disabled", () => {
    const tracer = initOpenTelemetry({ serviceName: "api", enabled: false });
    const span = tracer.startSpan("disabled", { route: "/health" });

    tracer.addEvent(span, "checked", { ok: true });
    tracer.endSpan(span);

    expect(tracer).toBeInstanceOf(NoopTracer);
    expect(getTracer()).toBe(tracer);
    expect(span).toMatchObject({
      name: "disabled",
      attributes: { route: "/health" },
      error: undefined,
    });
    expect(span.endedAt).toBeInstanceOf(Date);
    expect(span.events).toHaveLength(1);
  });

  it("uses injected tracers for deterministic tests and custom processors", async () => {
    const tracer = new RecordingTracer();
    initOpenTelemetry({ serviceName: "api", enabled: true, tracer });

    await expect(
      withSpan("custom", (span) => {
        getTracer().addEvent(span, "event", { value: 1 });
        return "ok";
      }),
    ).resolves.toBe("ok");

    await expect(
      withSpan("failing", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(tracer.ended).toHaveLength(2);
    expect(tracer.ended[0]?.span.events[0]?.name).toBe("event");
    expect(tracer.ended[1]?.error?.message).toBe("boom");
  });

  it("starts a NodeSDK-backed tracer when OTLP env config enables telemetry", async () => {
    let capturedConfig: OpenTelemetrySdkConfig | undefined;
    const sdk: TelemetrySdk = {
      start: vi.fn(),
      shutdown: vi.fn(),
    };

    const tracer = initOpenTelemetry({
      serviceName: "api",
      serviceVersion: "1.2.3",
      environment: "test",
      env: {
        OTEL_ENABLED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318/",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20abc,ignored,empty=",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "x-trace=trace%25value",
        OTEL_METRIC_EXPORT_INTERVAL: "2500",
      },
      sdkFactory: (config) => {
        capturedConfig = config;
        return sdk;
      },
    });

    const span = tracer.startSpan("http request", {
      bool: true,
      nil: null,
      number: 1,
      object: { nested: true },
      strings: ["a", "b"],
      numbers: [1, 2],
      booleans: [true, false],
      mixed: ["a", 1],
    });
    tracer.addEvent(span, "db", { system: "postgresql" });
    tracer.endSpan(span, new Error("failed"));

    expect(sdk.start).toHaveBeenCalledOnce();
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?.resource).toBeDefined();
    expect(capturedConfig?.traceExporter).toBeDefined();
    expect(capturedConfig?.metricReader).toBeDefined();
    expect(capturedConfig?.instrumentations).toBeDefined();
    expect(span.error?.message).toBe("failed");
    expect(span.events).toHaveLength(1);

    await shutdownOpenTelemetry();
    expect(sdk.shutdown).toHaveBeenCalledOnce();
    expect(getTracer()).toBeInstanceOf(NoopTracer);
  });

  it("resolves enablement, endpoints, and headers from standard OTEL env vars", () => {
    expect(
      isOpenTelemetryEnabled(
        { enabled: true },
        { OTEL_SDK_DISABLED: "true", OTEL_EXPORTER_OTLP_ENDPOINT: "http://x" },
      ),
    ).toBe(false);
    expect(isOpenTelemetryEnabled({ enabled: true }, {})).toBe(true);
    expect(isOpenTelemetryEnabled({ enabled: false }, {})).toBe(false);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: "yes" })).toBe(true);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: "off" })).toBe(false);
    expect(
      isOpenTelemetryEnabled({}, { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://t" }),
    ).toBe(true);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: "maybe" })).toBe(false);

    expect(
      resolveOtlpEndpoint(
        { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: " http://trace/v1/traces " },
        "traces",
      ),
    ).toBe("http://trace/v1/traces");
    expect(
      resolveOtlpEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://base//" }, "metrics"),
    ).toBe("http://base/v1/metrics");
    expect(resolveOtlpEndpoint({}, "traces")).toBeUndefined();

    expect(
      readOtlpHeaders(
        {
          OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20abc,bad,%=bad",
          OTEL_EXPORTER_OTLP_METRICS_HEADERS: "authorization=override,x-metric=one",
        },
        "metrics",
      ),
    ).toEqual({ authorization: "override", "%": "bad", "x-metric": "one" });
    expect(readOtlpHeaders({}, "traces")).toEqual({});
  });

  it("builds SDK config with defaults and explicit signal endpoints", () => {
    const config = createOpenTelemetrySdkConfig(
      {
        serviceName: "worker",
        instrumentations: [],
      },
      {
        NODE_ENV: "production",
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://metrics/v1/metrics",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://traces/v1/traces",
        OTEL_METRIC_EXPORT_INTERVAL: "invalid",
        OTEL_SERVICE_VERSION: "9.9.9",
      },
    );

    expect(config.resource).toBeDefined();
    expect(config.instrumentations).toEqual([]);
    expect(config.traceExporter).toBeDefined();
    expect(config.metricReader).toBeDefined();
  });
});
