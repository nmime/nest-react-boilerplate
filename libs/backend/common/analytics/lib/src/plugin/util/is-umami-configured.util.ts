import type { AnalyticsUmamiConfig } from "../../type";

export function isUmamiConfigured(
  config?: AnalyticsUmamiConfig,
): config is AnalyticsUmamiConfig & { websiteId: string } {
  return Boolean(
    config?.enabled !== false &&
    config?.websiteId &&
    (config.endpoint?.trim() || config.host?.trim()),
  );
}
