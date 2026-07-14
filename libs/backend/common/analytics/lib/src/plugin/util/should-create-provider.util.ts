import type { AnalyticsProviderName } from '../../type';

export function shouldCreateProvider(
  provider: AnalyticsProviderName,
  requestedProviders: Array<AnalyticsProviderName | 'auto'>,
  autoDetectProviders: boolean,
): boolean {
  return autoDetectProviders || requestedProviders.includes(provider);
}
