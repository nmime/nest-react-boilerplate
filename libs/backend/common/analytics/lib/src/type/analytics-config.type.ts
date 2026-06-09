import type { AnalyticsPlugin } from "./plugin-payload.type";

export type AnalyticsProviderName = "noop" | "ga4" | "posthog" | "umami";

export interface AnalyticsConfig {
  appName?: string;
  environment?: string;
  enabled?: boolean;
  /** Single provider shortcut. Use providers for multiple backends. */
  provider?: AnalyticsProviderName | "auto";
  providers?: Array<AnalyticsProviderName | "auto">;
  plugins?: AnalyticsPlugin[];
  ga4?: AnalyticsGa4Config;
  posthog?: AnalyticsPostHogConfig;
  umami?: AnalyticsUmamiConfig;
}

export interface AnalyticsGa4Config {
  enabled?: boolean;
  measurementId?: string;
  apiSecret?: string;
  collectUrl?: string;
  fetch?: typeof fetch;
}

export interface AnalyticsPostHogConfig {
  enabled?: boolean;
  apiKey?: string;
  host?: string;
  fetch?: typeof fetch;
}

export interface AnalyticsUmamiConfig {
  enabled?: boolean;
  websiteId?: string;
  endpoint?: string;
  host?: string;
  hostname?: string;
  fetch?: typeof fetch;
}
