import type { AnalyticsPlugin } from "../type";
import { NoopAnalyticsProvider } from "./providers";

export function createNoopAnalyticsPlugin(name = "noop"): AnalyticsPlugin {
  return new NoopAnalyticsProvider(name);
}
