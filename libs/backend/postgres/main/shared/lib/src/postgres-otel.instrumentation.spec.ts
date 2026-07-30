// @requirements REQ-RUNTIME-DATABASE-008
import { describe, expect, it } from 'vitest';
import { createPostgresOpenTelemetryInstrumentations } from './postgres-otel.instrumentation';

describe('PostgreSQL OpenTelemetry instrumentation', () => {
  it('owns only the PostgreSQL database instrumentation', () => {
    expect(
      createPostgresOpenTelemetryInstrumentations().map((instrumentation) => instrumentation.instrumentationName),
    ).toEqual(['@opentelemetry/instrumentation-pg']);
  });
});
