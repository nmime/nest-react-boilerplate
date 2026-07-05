import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { createOpenTelemetrySdkConfig } from "./factory";
import { NoopTracer } from "./tracer";
import { OpenTelemetryTracer } from "./tracer/open-telemetry.tracer";
import type {
  OpenTelemetryOptions,
  OpenTelemetrySdkConfig,
  TelemetrySdk,
} from "./type/otel-options.type";
import type { TracerLike } from "./type/trace-span.type";
import { isOpenTelemetryEnabled } from "./util/otel-env.util";

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

  /* v8 ignore start -- real NodeSDK integration path; unit tests inject a fake SDK via sdkFactory to avoid mutating global providers. */
  const sdkFactory =
    options.sdkFactory ??
    ((config: OpenTelemetrySdkConfig) => new NodeSDK(config));
  /* v8 ignore stop */
  const sdk = sdkFactory(createOpenTelemetrySdkConfig(options, env));
  const startResult = sdk.start();
  activeSdk = sdk;
  activeTracer = new OpenTelemetryTracer(trace.getTracer(options.serviceName));

  // start() may return a promise; a rejected start must not be left unhandled
  // while we keep serving spans as if the SDK were healthy. Fall back to the
  // noop tracer and surface a warning instead.
  if (isPromiseLike(startResult)) {
    void Promise.resolve(startResult).catch((error: unknown) => {
      activeSdk = undefined;
      activeTracer = new NoopTracer();
      process.stderr.write(
        `OpenTelemetry SDK failed to start; falling back to noop tracer: ${String(error)}\n`,
      );
    });
  }

  return activeTracer;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export const getTracer = (): TracerLike => activeTracer;

export async function shutdownOpenTelemetry(): Promise<void> {
  const sdk = activeSdk;
  activeSdk = undefined;
  activeTracer = new NoopTracer();
  await sdk?.shutdown();
}
