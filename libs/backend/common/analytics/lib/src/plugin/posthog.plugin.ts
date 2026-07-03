import type { AnalyticsPlugin } from "../type";
import {
  PostHogAnalyticsProvider,
  type PostHogAnalyticsPluginOptions,
} from "./providers";

export * from "./providers/posthog";

export function createPostHogAnalyticsPlugin(
  options: PostHogAnalyticsPluginOptions,
): AnalyticsPlugin {
  return new PostHogAnalyticsProvider(options);
}
