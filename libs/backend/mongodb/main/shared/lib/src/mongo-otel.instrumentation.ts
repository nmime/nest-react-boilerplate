import type { Instrumentation } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

export function createMongoOpenTelemetryInstrumentations(): Instrumentation[] {
  return [new MongoDBInstrumentation()];
}
