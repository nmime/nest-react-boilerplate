import type { TraceSpan } from "../otel";

export const isDatabaseSpan = (span: TraceSpan): boolean =>
  span.name.toLowerCase().includes("db") ||
  typeof span.attributes["db.system"] === "string";
