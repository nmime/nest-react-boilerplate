import type { TraceSpan } from "../otel";

export const isRedisSpan = (span: TraceSpan): boolean =>
  span.name.toLowerCase().includes("redis") ||
  span.attributes["db.system"] === "redis";
