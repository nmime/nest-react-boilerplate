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
  addEvent(span: TraceSpan, name: string, attributes?: Record<string, unknown>): void;
}
