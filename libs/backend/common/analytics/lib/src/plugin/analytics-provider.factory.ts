import type { AnalyticsPlugin, AnalyticsProviderFactoryConfig } from '../type';
import { createGa4MeasurementProtocolPlugin } from './ga4-measurement-protocol.plugin';
import { createNoopAnalyticsPlugin } from './noop.plugin';
import { createPostHogAnalyticsPlugin } from './posthog.plugin';
import { createUmamiAnalyticsPlugin } from './umami.plugin';
import { isUmamiConfigured, normalizeProviders, shouldCreateProvider } from './util';

export function createAnalyticsProviderPlugins(config: AnalyticsProviderFactoryConfig = {}): AnalyticsPlugin[] {
  const requestedProviders = normalizeProviders(config);
  const autoDetectProviders = requestedProviders.length === 0 || requestedProviders.includes('auto');
  const plugins: AnalyticsPlugin[] = [];

  if (requestedProviders.includes('noop')) {
    plugins.push(createNoopAnalyticsPlugin());
  }

  if (shouldCreateProvider('ga4', requestedProviders, autoDetectProviders)) {
    if (config.ga4?.enabled !== false && config.ga4?.measurementId && config.ga4.apiSecret) {
      plugins.push(
        createGa4MeasurementProtocolPlugin({
          measurementId: config.ga4.measurementId,
          apiSecret: config.ga4.apiSecret,
          endpoint: config.ga4.collectUrl,
          fetch: config.ga4.fetch,
        }),
      );
    }
  }

  if (shouldCreateProvider('posthog', requestedProviders, autoDetectProviders)) {
    if (config.posthog?.enabled !== false && config.posthog?.apiKey) {
      plugins.push(
        createPostHogAnalyticsPlugin({
          apiKey: config.posthog.apiKey,
          host: config.posthog.host,
          fetch: config.posthog.fetch,
        }),
      );
    }
  }

  if (shouldCreateProvider('umami', requestedProviders, autoDetectProviders)) {
    if (isUmamiConfigured(config.umami)) {
      plugins.push(
        createUmamiAnalyticsPlugin({
          websiteId: config.umami.websiteId,
          endpoint: config.umami.endpoint,
          host: config.umami.host,
          hostname: config.umami.hostname,
          fetch: config.umami.fetch,
        }),
      );
    }
  }

  if (plugins.length === 0 && requestedProviders.length > 0) {
    plugins.push(createNoopAnalyticsPlugin());
  }

  return plugins;
}
