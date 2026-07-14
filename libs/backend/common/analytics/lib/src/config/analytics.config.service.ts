import { Injectable } from '@nestjs/common';
import { createConfig } from '@app/common-config';
import { createAnalyticsProviderPlugins, createNoopAnalyticsPlugin } from '../plugin';
import type { AnalyticsConfig, AnalyticsPlugin, AnalyticsProviderName } from '../type';
import { analyticsEnvSchema, type AnalyticsEnvironment } from './analytics.env.schema';
import { stripTrailingSlash } from './util';

@Injectable()
export class AnalyticsConfigService {
  protected readonly configService = createConfig<AnalyticsEnvironment>(analyticsEnvSchema);
  private cachedPlugins?: AnalyticsPlugin[];

  constructor(private readonly config: AnalyticsConfig = {}) {}

  get appName(): string {
    return (
      this.config.appName ??
      this.configService.get('ANALYTICS_APP_NAME') ??
      this.configService.get('APP_NAME') ??
      'application'
    );
  }

  get environment(): string {
    return (
      this.config.environment ??
      this.configService.get('ANALYTICS_ENVIRONMENT') ??
      this.configService.get('NODE_ENV') ??
      'development'
    );
  }

  get enabled(): boolean {
    return this.config.enabled ?? this.configService.get('ANALYTICS_ENABLED');
  }

  get provider(): AnalyticsProviderName | 'auto' | undefined {
    return this.config.provider ?? this.configService.get('ANALYTICS_PROVIDER');
  }

  get providers(): Array<AnalyticsProviderName | 'auto'> | undefined {
    if (this.config.providers?.length) {
      return this.config.providers;
    }

    return this.configService.get('ANALYTICS_PROVIDERS');
  }

  get ga4MeasurementId(): string {
    return this.config.ga4?.measurementId ?? this.configService.get('ANALYTICS_GA4_MEASUREMENT_ID');
  }

  get ga4ApiSecret(): string {
    return this.config.ga4?.apiSecret ?? this.configService.get('ANALYTICS_GA4_API_SECRET');
  }

  get ga4CollectUrl(): string {
    return this.config.ga4?.collectUrl ?? this.configService.get('ANALYTICS_GA4_COLLECT_URL');
  }

  get postHogApiKey(): string {
    return this.config.posthog?.apiKey ?? this.configService.get('ANALYTICS_POSTHOG_API_KEY');
  }

  get postHogHost(): string {
    return this.config.posthog?.host ?? this.configService.get('ANALYTICS_POSTHOG_HOST');
  }

  get umamiWebsiteId(): string {
    return this.config.umami?.websiteId ?? this.configService.get('ANALYTICS_UMAMI_WEBSITE_ID');
  }

  get umamiEndpoint(): string {
    const configuredEndpoint = this.config.umami?.endpoint ?? this.configService.get('ANALYTICS_UMAMI_ENDPOINT');

    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const host = this.config.umami?.host ?? this.configService.get('ANALYTICS_UMAMI_HOST');

    return host ? `${stripTrailingSlash(host)}/api/send` : '';
  }

  get umamiHostname(): string {
    return this.config.umami?.hostname ?? this.configService.get('ANALYTICS_UMAMI_HOSTNAME') ?? this.appName;
  }

  get isProduction(): boolean {
    return this.environment === 'production';
  }

  get plugins(): AnalyticsPlugin[] {
    this.cachedPlugins ??= this.createPlugins();

    return this.cachedPlugins;
  }

  private createPlugins(): AnalyticsPlugin[] {
    const plugins = [...(this.config.plugins ?? [])];
    const providerPlugins = createAnalyticsProviderPlugins({
      provider: this.provider,
      providers: this.providers,
      ga4: {
        ...this.config.ga4,
        measurementId: this.ga4MeasurementId,
        apiSecret: this.ga4ApiSecret,
        collectUrl: this.ga4CollectUrl,
      },
      posthog: {
        ...this.config.posthog,
        apiKey: this.postHogApiKey,
        host: this.postHogHost,
      },
      umami: {
        ...this.config.umami,
        websiteId: this.umamiWebsiteId,
        endpoint: this.umamiEndpoint || undefined,
        hostname: this.umamiHostname,
      },
    });

    plugins.push(...providerPlugins);

    if (plugins.length === 0) {
      plugins.push(createNoopAnalyticsPlugin());
    }

    return plugins;
  }
}
