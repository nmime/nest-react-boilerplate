import { SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";
import type { TraceSpan, TracerLike } from "../type/trace-span.type";
import { toAttributes } from "../util/attributes.util";

const otelSpanSymbol = Symbol("otelSpan");

type OtelSpanHolder = TraceSpan & { [otelSpanSymbol]?: Span };

export class OpenTelemetryTracer implements TracerLike {
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
    // Defensive for spans created by alternate TracerLike implementations.
    if (!otelSpan) {
      return;
    }
    if (error) {
      otelSpan.recordException(error);
      otelSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
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
