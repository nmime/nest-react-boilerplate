import type { TraceSpan } from "../otel";

export type SpanFilter = (span: TraceSpan) => boolean;

export class FilteredBatchSpanProcessor {
  private readonly spans: TraceSpan[] = [];

  constructor(private readonly filter: SpanFilter = () => true) {}

  add(span: TraceSpan): void {
    if (this.filter(span)) {
      this.spans.push(span);
    }
  }

  flush(): TraceSpan[] {
    return this.spans.splice(0);
  }
}
