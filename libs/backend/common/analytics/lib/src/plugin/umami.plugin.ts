import type { AnalyticsPlugin } from "../type";
import {
  UmamiAnalyticsProvider,
  type UmamiAnalyticsPluginOptions,
} from "./providers";

export * from "./providers/umami";

export function createUmamiAnalyticsPlugin(
  options: UmamiAnalyticsPluginOptions,
): AnalyticsPlugin {
  return new UmamiAnalyticsProvider(options);
}
