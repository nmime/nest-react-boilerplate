import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";
import {
  createAnalyticsProviderPlugins,
  createNoopAnalyticsPlugin,
} from "../plugin";
import type {
  AnalyticsConfig,
  AnalyticsPlugin,
  AnalyticsProviderName,
} from "../type";

interface AnalyticsEnvironment {
  ANALYTICS_APP_NAME?: string;
  APP_NAME?: string;
  ANALYTICS_ENVIRONMENT?: string;
  NODE_ENV?: string;
  ANALYTICS_ENABLED: boolean;
  ANALYTICS_PROVIDER?: AnalyticsProviderName | "auto";
  ANALYTICS_PROVIDERS?: Array<AnalyticsProviderName | "auto">;
  ANALYTICS_GA4_MEASUREMENT_ID: string;
  ANALYTICS_GA4_API_SECRET: string;
  ANALYTICS_GA4_COLLECT_URL: string;
  ANALYTICS_POSTHOG_API_KEY: string;
  ANALYTICS_POSTHOG_HOST: string;
  ANALYTICS_UMAMI_WEBSITE_ID: string;
  ANALYTICS_UMAMI_ENDPOINT?: string;
  ANALYTICS_UMAMI_HOST?: string;
  ANALYTICS_UMAMI_HOSTNAME?: string;
}

const providerSchema = Joi.string().valid(
  "noop",
  "ga4",
  "posthog",
  "umami",
  "auto",
);

const schema = Joi.object<AnalyticsEnvironment>({
  ANALYTICS_APP_NAME: Joi.string().empty("").optional(),
  APP_NAME: Joi.string().empty("").optional(),
  ANALYTICS_ENVIRONMENT: Joi.string().empty("").optional(),
  NODE_ENV: Joi.string().empty("").optional(),
  ANALYTICS_ENABLED: Joi.boolean()
    .truthy("1", "true", "yes", "on")
    .falsy("0", "false", "no", "off")
    .default(true),
  ANALYTICS_PROVIDER: providerSchema.empty("").optional(),
  ANALYTICS_PROVIDERS: Joi.alternatives()
    .try(
      Joi.array().items(providerSchema),
      Joi.string().custom(parseProvidersConfig, "analytics providers list"),
    )
    .optional(),
  ANALYTICS_GA4_MEASUREMENT_ID: Joi.string().empty("").default(""),
  ANALYTICS_GA4_API_SECRET: Joi.string().empty("").default(""),
  ANALYTICS_GA4_COLLECT_URL: Joi.string()
    .empty("")
    .default("https://www.google-analytics.com/mp/collect"),
  ANALYTICS_POSTHOG_API_KEY: Joi.string().empty("").default(""),
  ANALYTICS_POSTHOG_HOST: Joi.string()
    .empty("")
    .default("https://app.posthog.com"),
  ANALYTICS_UMAMI_WEBSITE_ID: Joi.string().empty("").default(""),
  ANALYTICS_UMAMI_ENDPOINT: Joi.string().empty("").optional(),
  ANALYTICS_UMAMI_HOST: Joi.string().empty("").optional(),
  ANALYTICS_UMAMI_HOSTNAME: Joi.string().empty("").optional(),
});

@Injectable()
export class AnalyticsConfigService {
  protected readonly configService = createConfig(schema);
  private cachedPlugins?: AnalyticsPlugin[];

  constructor(private readonly config: AnalyticsConfig = {}) {}

  get appName(): string {
    return (
      this.config.appName ??
      this.configService.get("ANALYTICS_APP_NAME") ??
      this.configService.get("APP_NAME") ??
      "application"
    );
  }

  get environment(): string {
    return (
      this.config.environment ??
      this.configService.get("ANALYTICS_ENVIRONMENT") ??
      this.configService.get("NODE_ENV") ??
      "development"
    );
  }

  get enabled(): boolean {
    return this.config.enabled ?? this.configService.get("ANALYTICS_ENABLED");
  }

  get provider(): AnalyticsProviderName | "auto" | undefined {
    return this.config.provider ?? this.configService.get("ANALYTICS_PROVIDER");
  }

  get providers(): Array<AnalyticsProviderName | "auto"> | undefined {
    if (this.config.providers?.length) {
      return this.config.providers;
    }

    return this.configService.get("ANALYTICS_PROVIDERS");
  }

  get ga4MeasurementId(): string {
    return (
      this.config.ga4?.measurementId ??
      this.configService.get("ANALYTICS_GA4_MEASUREMENT_ID")
    );
  }

  get ga4ApiSecret(): string {
    return (
      this.config.ga4?.apiSecret ??
      this.configService.get("ANALYTICS_GA4_API_SECRET")
    );
  }

  get ga4CollectUrl(): string {
    return (
      this.config.ga4?.collectUrl ??
      this.configService.get("ANALYTICS_GA4_COLLECT_URL")
    );
  }

  get postHogApiKey(): string {
    return (
      this.config.posthog?.apiKey ??
      this.configService.get("ANALYTICS_POSTHOG_API_KEY")
    );
  }

  get postHogHost(): string {
    return (
      this.config.posthog?.host ??
      this.configService.get("ANALYTICS_POSTHOG_HOST")
    );
  }

  get umamiWebsiteId(): string {
    return (
      this.config.umami?.websiteId ??
      this.configService.get("ANALYTICS_UMAMI_WEBSITE_ID")
    );
  }

  get umamiEndpoint(): string {
    const configuredEndpoint =
      this.config.umami?.endpoint ??
      this.configService.get("ANALYTICS_UMAMI_ENDPOINT");

    if (configuredEndpoint) {
      return configuredEndpoint;
    }

    const host =
      this.config.umami?.host ?? this.configService.get("ANALYTICS_UMAMI_HOST");

    return host ? `${stripTrailingSlash(host)}/api/send` : "";
  }

  get umamiHostname(): string {
    return (
      this.config.umami?.hostname ??
      this.configService.get("ANALYTICS_UMAMI_HOSTNAME") ??
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

function parseProvidersConfig(
  value: string,
  helpers: Joi.CustomHelpers,
): Array<AnalyticsProviderName | "auto"> {
  const providers: Array<AnalyticsProviderName | "auto"> = [];
  for (const provider of value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    if (isProviderName(provider) || provider === "auto") {
      providers.push(provider);
    } else {
      return helpers.error("any.only") as never;
    }
  }

  return providers;
}

function isProviderName(value: string): value is AnalyticsProviderName {
  return ["noop", "ga4", "posthog", "umami"].includes(value);
}

function stripTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }

  return value.slice(0, end);
}
