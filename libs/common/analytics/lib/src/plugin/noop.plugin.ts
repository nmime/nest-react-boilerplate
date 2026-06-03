import type { AnalyticsPlugin } from "../type";

export function createNoopAnalyticsPlugin(name = "noop"): AnalyticsPlugin {
  return {
    name,
    track: () => undefined,
    identify: () => undefined,
    page: () => undefined,
  };
}
