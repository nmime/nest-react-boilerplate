import type { Instrumentation } from "@opentelemetry/instrumentation";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import type { OpenTelemetryEnvironment } from "./otel-environment.type";
import type { TracerLike } from "./trace-span.type";

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
