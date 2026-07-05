import type { TraceSpan, TracerLike } from "../type/trace-span.type";

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
