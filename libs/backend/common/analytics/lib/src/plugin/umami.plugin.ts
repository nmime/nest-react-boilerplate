import type { AnalyticsPlugin } from "../type";
import {
  UmamiAnalyticsProvider,
  type UmamiAnalyticsPluginOptions,
} from "./providers";

export type { UmamiAnalyticsPluginOptions };

export function createUmamiAnalyticsPlugin(
  options: UmamiAnalyticsPluginOptions,
): AnalyticsPlugin {
  return new UmamiAnalyticsProvider(options);
}
