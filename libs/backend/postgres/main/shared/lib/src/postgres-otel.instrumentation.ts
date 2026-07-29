import type { Instrumentation } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

export function createPostgresOpenTelemetryInstrumentations(): Instrumentation[] {
  return [new PgInstrumentation()];
}
