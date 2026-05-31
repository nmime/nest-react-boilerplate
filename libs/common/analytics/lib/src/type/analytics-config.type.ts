import type { AnalyticsPlugin } from "./plugin-payload.type";

export interface AnalyticsConfig {
  appName?: string;
  environment?: string;
  enabled?: boolean;
  plugins?: AnalyticsPlugin[];
  ga4?: AnalyticsGa4Config;
}

export interface AnalyticsGa4Config {
  enabled?: boolean;
  measurementId?: string;
  apiSecret?: string;
  collectUrl?: string;
  fetch?: typeof fetch;
}
