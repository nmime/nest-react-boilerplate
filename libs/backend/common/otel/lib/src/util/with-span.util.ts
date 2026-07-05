import { getTracer } from "../otel";
import type { TraceSpan } from "../type/trace-span.type";

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
