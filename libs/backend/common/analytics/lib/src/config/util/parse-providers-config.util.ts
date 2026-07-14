import Joi from 'joi';
import type { AnalyticsProviderName } from '../../type';

export function parseProvidersConfig(value: string, helpers: Joi.CustomHelpers): Array<AnalyticsProviderName | 'auto'> {
  const providers: Array<AnalyticsProviderName | 'auto'> = [];
  for (const provider of value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    if (isProviderName(provider) || provider === 'auto') {
      providers.push(provider);
    } else {
      return helpers.error('any.only') as never;
    }
  }

  return providers;
}

function isProviderName(value: string): value is AnalyticsProviderName {
  return ['noop', 'ga4', 'posthog', 'umami'].includes(value);
}
