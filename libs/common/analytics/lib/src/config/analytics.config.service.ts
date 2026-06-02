import { Injectable } from "@nestjs/common";
import {
  createAnalyticsProviderPlugins,
  createNoopAnalyticsPlugin,
} from "../plugin";
import type {
  AnalyticsConfig,
  AnalyticsPlugin,
  AnalyticsProviderName,
} from "../type";

@Injectable()
export class AnalyticsConfigService {
  private cachedPlugins?: AnalyticsPlugin[];

  constructor(private readonly config: AnalyticsConfig = {}) {}

  get appName(): string {
    return (
      this.config.appName ??
      process.env.ANALYTICS_APP_NAME ??
      process.env.APP_NAME ??
      "application"
    );
  }

  get environment(): string {
    return (
      this.config.environment ??
      process.env.ANALYTICS_ENVIRONMENT ??
      process.env.NODE_ENV ??
      "development"
    );
  }

  get enabled(): boolean {
    return this.config.enabled ?? readBooleanConfig("ANALYTICS_ENABLED", true);
  }

  get provider(): AnalyticsProviderName | "auto" | undefined {
    return (
      this.config.provider ??
      readProviderConfig(process.env.ANALYTICS_PROVIDER)
    );
  }

  get providers(): Array<AnalyticsProviderName | "auto"> | undefined {
    if (this.config.providers?.length) {
      return this.config.providers;
    }

    return readProviderListConfig(process.env.ANALYTICS_PROVIDERS);
  }

  get ga4MeasurementId(): string {
    return (
      this.config.ga4?.measurementId ??
      process.env.ANALYTICS_GA4_MEASUREMENT_ID ??
      ""
    );
  }

  get ga4ApiSecret(): string {
    return (
      this.config.ga4?.apiSecret ?? process.env.ANALYTICS_GA4_API_SECRET ?? ""
    );
  }

  get ga4CollectUrl(): string {
    return (
      this.config.ga4?.collectUrl ??
      process.env.ANALYTICS_GA4_COLLECT_URL ??
      "https://www.google-analytics.com/mp/collect"
    );
  }

  get postHogApiKey(): string {
    return (
      this.config.posthog?.apiKey ??
      process.env.ANALYTICS_POSTHOG_API_KEY ??
      ""
    );
  }

  get postHogHost(): string {
    return (
      this.config.posthog?.host ??
      process.env.ANALYTICS_POSTHOG_HOST ??
      "https://app.posthog.com"
    );
  }

  get umamiWebsiteId(): string {
    return (
      this.config.umami?.websiteId ??
      process.env.ANALYTICS_UMAMI_WEBSITE_ID ??
      ""
    );
  }

  get umamiEndpoint(): string {
    const configuredEndpoint =
      this.config.umami?.endpoint ?? process.env.ANALYTICS_UMAMI_ENDPOINT;

    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const host = this.config.umami?.host ?? process.env.ANALYTICS_UMAMI_HOST;

    return host ? `${host.replace(/\/+$/, "")}/api/send` : "";
  }

  get umamiHostname(): string {
    return (
      this.config.umami?.hostname ??
      process.env.ANALYTICS_UMAMI_HOSTNAME ??
      this.appName
    );
  }

  get isProduction(): boolean {
    return this.environment === "production";
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

function readBooleanConfig(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  switch (value.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`Invalid boolean config ${name}: ${value}`);
  }
}

function readProviderConfig(
  value?: string,
): AnalyticsProviderName | "auto" | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (isProviderName(normalized) || normalized === "auto") {
    return normalized;
  }

  throw new Error(`Invalid analytics provider: ${value}`);
}

function readProviderListConfig(
  value?: string,
): Array<AnalyticsProviderName | "auto"> | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean)
    .map(readProviderConfig)
    .filter((provider): provider is AnalyticsProviderName | "auto" => Boolean(provider));
}

function isProviderName(value: string): value is AnalyticsProviderName {
  return ["noop", "ga4", "posthog", "umami"].includes(value);
}
