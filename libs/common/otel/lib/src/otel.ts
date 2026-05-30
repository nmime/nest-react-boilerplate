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

export interface OpenTelemetryOptions {
  serviceName: string;
  environment?: string;
  enabled?: boolean;
  tracer?: TracerLike;
}

let activeTracer: TracerLike = new NoopTracer();

export function initOpenTelemetry(options: OpenTelemetryOptions): TracerLike {
  activeTracer =
    options.enabled === false
      ? new NoopTracer()
      : (options.tracer ?? new NoopTracer());
  return activeTracer;
}

export const getTracer = (): TracerLike => activeTracer;

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
