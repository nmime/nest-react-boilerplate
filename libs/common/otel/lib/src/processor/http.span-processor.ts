import type { TraceSpan } from "../otel";

export const isHttpSpan = (span: TraceSpan): boolean =>
  span.name.toLowerCase().includes("http") ||
  typeof span.attributes["http.method"] === "string";
