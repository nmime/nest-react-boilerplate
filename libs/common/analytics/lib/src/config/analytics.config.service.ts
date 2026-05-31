import { Injectable } from "@nestjs/common";
import { createGa4MeasurementProtocolPlugin } from "../plugin";
import type { AnalyticsConfig, AnalyticsPlugin } from "../type";

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

  get isProduction(): boolean {
    return this.environment === "production";
  }

  get plugins(): AnalyticsPlugin[] {
    this.cachedPlugins ??= this.createPlugins();

    return this.cachedPlugins;
  }

  private createPlugins(): AnalyticsPlugin[] {
    const plugins = [...(this.config.plugins ?? [])];

    if (this.ga4Enabled) {
      plugins.push(
        createGa4MeasurementProtocolPlugin({
          measurementId: this.ga4MeasurementId,
          apiSecret: this.ga4ApiSecret,
          endpoint: this.ga4CollectUrl,
          fetch: this.config.ga4?.fetch,
        }),
      );
    }

    return plugins;
  }

  private get ga4Enabled(): boolean {
    return (
      this.config.ga4?.enabled ??
      Boolean(this.ga4MeasurementId && this.ga4ApiSecret)
    );
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
