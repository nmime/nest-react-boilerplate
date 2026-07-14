import type {
  AnalyticsGa4Config,
  AnalyticsPostHogConfig,
  AnalyticsProviderName,
  AnalyticsUmamiConfig,
} from './analytics-config.type';

export interface AnalyticsProviderFactoryConfig {
  provider?: AnalyticsProviderName | 'auto';
  providers?: Array<AnalyticsProviderName | 'auto'>;
  ga4?: AnalyticsGa4Config;
  posthog?: AnalyticsPostHogConfig;
  umami?: AnalyticsUmamiConfig;
}
