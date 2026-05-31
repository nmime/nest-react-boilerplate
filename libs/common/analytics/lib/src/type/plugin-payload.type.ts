import type { AnalyticsSourceType } from "../enum";

export interface AnalyticsPayload<TProperties = Record<string, unknown>> {
  event: string;
  userId?: string;
  anonymousId?: string;
  source?: AnalyticsSourceType | string;
  properties?: TProperties;
  context?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AnalyticsIdentifyPayload<TTraits = Record<string, unknown>> {
  userId: string;
  traits?: TTraits;
  context?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AnalyticsPagePayload<TProperties = Record<string, unknown>> {
  name?: string;
  path?: string;
  properties?: TProperties;
  context?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AnalyticsPlugin {
  name: string;
  track?(payload: AnalyticsPayload): Promise<void> | void;
  identify?(payload: AnalyticsIdentifyPayload): Promise<void> | void;
  page?(payload: AnalyticsPagePayload): Promise<void> | void;
}
