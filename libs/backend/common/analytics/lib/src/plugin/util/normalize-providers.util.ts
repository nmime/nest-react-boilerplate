import type {
  AnalyticsProviderFactoryConfig,
  AnalyticsProviderName,
} from "../../type";

export function normalizeProviders(
  config: AnalyticsProviderFactoryConfig,
): Array<AnalyticsProviderName | "auto"> {
  const providers = config.providers?.length ? config.providers : undefined;

  return [...new Set(providers ?? (config.provider ? [config.provider] : []))];
}
