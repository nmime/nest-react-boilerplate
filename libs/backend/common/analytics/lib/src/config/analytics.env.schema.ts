import Joi from 'joi';
import type { AnalyticsProviderName } from '../type';
import { parseProvidersConfig } from './util';

export interface AnalyticsEnvironment {
  ANALYTICS_APP_NAME?: string;
  APP_NAME?: string;
  ANALYTICS_ENVIRONMENT?: string;
  NODE_ENV?: string;
  ANALYTICS_ENABLED: boolean;
  ANALYTICS_PROVIDER?: AnalyticsProviderName | 'auto';
  ANALYTICS_PROVIDERS?: Array<AnalyticsProviderName | 'auto'>;
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

const providerSchema = Joi.string().valid('noop', 'ga4', 'posthog', 'umami', 'auto');

export const analyticsEnvSchema = Joi.object<AnalyticsEnvironment>({
  ANALYTICS_APP_NAME: Joi.string().empty('').optional(),
  APP_NAME: Joi.string().empty('').optional(),
  ANALYTICS_ENVIRONMENT: Joi.string().empty('').optional(),
  NODE_ENV: Joi.string().empty('').optional(),
  ANALYTICS_ENABLED: Joi.boolean().truthy('1', 'true', 'yes', 'on').falsy('0', 'false', 'no', 'off').default(true),
  ANALYTICS_PROVIDER: providerSchema.empty('').optional(),
  ANALYTICS_PROVIDERS: Joi.alternatives()
    .try(Joi.array().items(providerSchema), Joi.string().custom(parseProvidersConfig, 'analytics providers list'))
    .optional(),
  ANALYTICS_GA4_MEASUREMENT_ID: Joi.string().empty('').default(''),
  ANALYTICS_GA4_API_SECRET: Joi.string().empty('').default(''),
  ANALYTICS_GA4_COLLECT_URL: Joi.string().empty('').default('https://www.google-analytics.com/mp/collect'),
  ANALYTICS_POSTHOG_API_KEY: Joi.string().empty('').default(''),
  ANALYTICS_POSTHOG_HOST: Joi.string().empty('').default('https://app.posthog.com'),
  ANALYTICS_UMAMI_WEBSITE_ID: Joi.string().empty('').default(''),
  ANALYTICS_UMAMI_ENDPOINT: Joi.string().empty('').optional(),
  ANALYTICS_UMAMI_HOST: Joi.string().empty('').optional(),
  ANALYTICS_UMAMI_HOSTNAME: Joi.string().empty('').optional(),
});
