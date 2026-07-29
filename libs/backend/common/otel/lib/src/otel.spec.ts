import { SpanStatusCode } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenTelemetrySdkConfig,
  createOpenTelemetryInstrumentations,
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
} from './index';
import { OpenTelemetryTracer } from './tracer/open-telemetry.tracer';

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

  addEvent(span: TraceSpan, name: string, attributes?: Record<string, unknown>): void {
    span.events.push({ name, attributes, at: new Date() });
  }
}

describe('OpenTelemetry bootstrap', () => {
  afterEach(async () => {
    await shutdownOpenTelemetry();
  });

  it('keeps the noop fallback when telemetry is disabled', () => {
    const tracer = initOpenTelemetry({ serviceName: 'api', enabled: false });
    const span = tracer.startSpan('disabled', { route: '/health' });

    tracer.addEvent(span, 'checked', { ok: true });
    tracer.endSpan(span);

    expect(tracer).toBeInstanceOf(NoopTracer);
    expect(getTracer()).toBe(tracer);
    expect(span).toMatchObject({
      name: 'disabled',
      attributes: { route: '/health' },
      error: undefined,
    });
    expect(span.endedAt).toBeInstanceOf(Date);
    expect(span.events).toHaveLength(1);
  });

  it('uses injected tracers for deterministic tests and custom processors', async () => {
    const tracer = new RecordingTracer();
    initOpenTelemetry({ serviceName: 'api', enabled: true, tracer });

    await expect(
      withSpan('custom', (span) => {
        getTracer().addEvent(span, 'event', { value: 1 });
        return 'ok';
      }),
    ).resolves.toBe('ok');

    await expect(
      withSpan('failing', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // A non-Error throw is normalized into an Error before the span is ended.
    await expect(
      withSpan('failing-string', () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error normalization branch of withSpan.
        throw 'plain failure';
      }),
    ).rejects.toThrow('plain failure');

    expect(tracer.ended).toHaveLength(3);
    expect(tracer.ended[0]?.span.events[0]?.name).toBe('event');
    expect(tracer.ended[1]?.error?.message).toBe('boom');
    expect(tracer.ended[2]?.error).toBeInstanceOf(Error);
    expect(tracer.ended[2]?.error?.message).toBe('plain failure');
  });

  it('starts a NodeSDK-backed tracer when OTLP env config enables telemetry', async () => {
    let capturedConfig: OpenTelemetrySdkConfig | undefined;
    const start = vi.fn();
    const shutdown = vi.fn();
    const sdk: TelemetrySdk = {
      start,
      shutdown,
    };

    const tracer = initOpenTelemetry({
      serviceName: 'api',
      serviceVersion: '1.2.3',
      environment: 'test',
      env: {
        OTEL_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector:4318/',
        OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20abc,ignored,empty=',
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'x-trace=trace%25value',
        OTEL_METRIC_EXPORT_INTERVAL: '2500',
      },
      sdkFactory: (config) => {
        capturedConfig = config;
        return sdk;
      },
    });

    const span = tracer.startSpan('http request', {
      bool: true,
      nil: null,
      number: 1,
      object: { nested: true },
      strings: ['a', 'b'],
      numbers: [1, 2],
      booleans: [true, false],
      mixed: ['a', 1],
      big: 42n,
      when: new Date('2024-01-02T03:04:05.006Z'),
    });
    tracer.addEvent(span, 'db', { system: 'postgresql' });
    tracer.endSpan(span, new Error('failed'));

    expect(start).toHaveBeenCalledOnce();
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?.resource).toBeDefined();
    expect(capturedConfig?.traceExporter).toBeDefined();
    expect(capturedConfig).toHaveProperty('metricReader');
    expect(capturedConfig?.instrumentations).toBeDefined();
    expect(span.error?.message).toBe('failed');
    expect(span.events).toHaveLength(1);

    await shutdownOpenTelemetry();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(getTracer()).toBeInstanceOf(NoopTracer);
  });

  it('falls back to the noop tracer when the SDK fails to start', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const shutdown = vi.fn();

    initOpenTelemetry({
      serviceName: 'api',
      enabled: true,
      sdkFactory: () => ({
        start: () => Promise.reject(new Error('collector unreachable')),
        shutdown,
      }),
    });

    await vi.waitFor(() => {
      expect(getTracer()).toBeInstanceOf(NoopTracer);
    });
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('resolves enablement, endpoints, and headers from standard OTEL env vars', () => {
    expect(
      isOpenTelemetryEnabled(
        { enabled: true },
        { OTEL_SDK_DISABLED: 'true', OTEL_EXPORTER_OTLP_ENDPOINT: 'https://x' },
      ),
    ).toBe(false);
    expect(isOpenTelemetryEnabled({ enabled: true }, {})).toBe(true);
    expect(isOpenTelemetryEnabled({ enabled: false }, {})).toBe(false);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: 'yes' })).toBe(true);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: 'off' })).toBe(false);
    expect(isOpenTelemetryEnabled({}, { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://t' })).toBe(true);
    expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: 'maybe' })).toBe(false);

    expect(resolveOtlpEndpoint({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ' https://trace/v1/traces ' }, 'traces')).toBe(
      'https://trace/v1/traces',
    );
    expect(resolveOtlpEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://base//' }, 'metrics')).toBe(
      'https://base/v1/metrics',
    );
    expect(resolveOtlpEndpoint({}, 'traces')).toBeUndefined();

    expect(
      readOtlpHeaders(
        {
          OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20abc,bad,%=bad,x-raw=%',
          OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'authorization=override,x-metric=one',
        },
        'metrics',
      ),
    ).toEqual({
      authorization: 'override',
      '%': 'bad',
      'x-metric': 'one',
      'x-raw': '%',
    });
    expect(readOtlpHeaders({}, 'traces')).toEqual({});
  });

  it('builds SDK config with defaults and explicit signal endpoints', () => {
    const config = createOpenTelemetrySdkConfig(
      {
        serviceName: 'worker',
        instrumentations: [],
      },
      {
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'https://metrics/v1/metrics',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://traces/v1/traces',
        OTEL_METRIC_EXPORT_INTERVAL: 'invalid',
        OTEL_SERVICE_VERSION: '9.9.9',
      },
    );

    expect(config.resource).toBeDefined();
    expect(config.instrumentations).toEqual([]);
    expect(config.traceExporter).toBeDefined();
    expect(config).toHaveProperty('metricReader');
  });

  it('builds only the provider-neutral runtime instrumentation set by default', () => {
    const instrumentations = createOpenTelemetryInstrumentations();

    expect(instrumentations.map((instrumentation) => instrumentation.instrumentationName)).toEqual([
      '@opentelemetry/instrumentation-http',
      '@fastify/otel',
      '@opentelemetry/instrumentation-nestjs-core',
      '@opentelemetry/instrumentation-redis',
      '@opentelemetry/instrumentation-runtime-node',
    ]);
    expect(instrumentations.map((instrumentation) => instrumentation.instrumentationName)).not.toContain(
      '@opentelemetry/instrumentation-pg',
    );
    expect(instrumentations.map((instrumentation) => instrumentation.instrumentationName)).not.toContain(
      '@opentelemetry/instrumentation-mongodb',
    );
  });

  it('omits optional resource attributes when no version or environment is resolvable', () => {
    const config = createOpenTelemetrySdkConfig({ serviceName: 'worker', instrumentations: [] }, {});

    expect(config.resource).toBeDefined();
    expect(config.traceExporter).toBeDefined();
  });

  it('resolves every recognized boolean token for OTEL_ENABLED', () => {
    for (const truthy of ['1', 'true', 'yes', 'on']) {
      expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: truthy })).toBe(true);
    }
    for (const falsy of ['0', 'false', 'no', 'off']) {
      expect(isOpenTelemetryEnabled({}, { OTEL_ENABLED: falsy })).toBe(false);
    }
    // A disabled SDK flag short-circuits regardless of other configuration.
    expect(isOpenTelemetryEnabled({ enabled: true }, { OTEL_SDK_DISABLED: 'on', OTEL_ENABLED: 'true' })).toBe(false);
    // An unparseable OTEL_SDK_DISABLED value is treated as absent.
    expect(isOpenTelemetryEnabled({ enabled: true }, { OTEL_SDK_DISABLED: 'maybe' })).toBe(true);
  });
});

describe('OpenTelemetryTracer', () => {
  const createFakeSpan = () => ({
    addEvent: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
  });

  it('bridges span lifecycle onto the underlying OpenTelemetry span', () => {
    const fakeSpan = createFakeSpan();
    const startSpan = vi.fn(() => fakeSpan);
    const tracer = new OpenTelemetryTracer({
      startSpan,
    } as unknown as ConstructorParameters<typeof OpenTelemetryTracer>[0]);

    const span = tracer.startSpan('op');
    expect(startSpan).toHaveBeenCalledWith('op', { attributes: {} });

    tracer.addEvent(span, 'with-attributes', { key: 'value' });
    tracer.addEvent(span, 'without-attributes');
    expect(fakeSpan.addEvent).toHaveBeenCalledWith('with-attributes', {
      key: 'value',
    });
    expect(fakeSpan.addEvent).toHaveBeenCalledWith('without-attributes', {});

    tracer.endSpan(span);
    expect(fakeSpan.recordException).not.toHaveBeenCalled();
    expect(fakeSpan.end).toHaveBeenCalledTimes(1);

    const failing = tracer.startSpan('failing', { route: '/x' });
    const error = new Error('boom');
    tracer.endSpan(failing, error);
    expect(fakeSpan.recordException).toHaveBeenCalledWith(error);
    expect(fakeSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
  });

  it('ignores spans created by an alternate tracer implementation', () => {
    const tracer = new OpenTelemetryTracer({
      startSpan: vi.fn(),
    } as unknown as ConstructorParameters<typeof OpenTelemetryTracer>[0]);
    const foreignSpan: TraceSpan = {
      name: 'foreign',
      attributes: {},
      startedAt: new Date(),
      events: [],
    };

    expect(() => {
      tracer.endSpan(foreignSpan);
    }).not.toThrow();
    expect(foreignSpan.endedAt).toBeInstanceOf(Date);
  });
});
