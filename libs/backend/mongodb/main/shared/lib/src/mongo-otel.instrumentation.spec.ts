// @requirements REQ-RUNTIME-DATABASE-008
import { describe, expect, it } from 'vitest';
import { createMongoOpenTelemetryInstrumentations } from './mongo-otel.instrumentation';

describe('MongoDB OpenTelemetry instrumentation', () => {
  it('owns only the MongoDB database instrumentation', () => {
    expect(
      createMongoOpenTelemetryInstrumentations().map((instrumentation) => instrumentation.instrumentationName),
    ).toEqual(['@opentelemetry/instrumentation-mongodb']);
  });
});
