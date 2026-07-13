import type { AnalyticsProvider } from '../contracts/analytics.provider';

export class PostHogProvider implements AnalyticsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly host: string = 'https://us.i.posthog.com',
  ) {}

  track(event: string, properties?: Record<string, unknown>, userId?: string): void {
    fetch(`${this.host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        event,
        properties,
        distinct_id: userId ?? 'anonymous',
      }),
      signal: AbortSignal.timeout(1000),
    }).catch(() => {
      // Fire-and-forget: silently ignore network errors
    });
  }
}
