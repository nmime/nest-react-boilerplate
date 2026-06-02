import type { AnalyticsPlugin } from "../type";

export interface Ga4MeasurementProtocolPluginOptions {
  measurementId: string;
  apiSecret: string;
  endpoint?: string;
  fetch?: typeof fetch;
}

export function createGa4MeasurementProtocolPlugin(
  options: Ga4MeasurementProtocolPluginOptions,
): AnalyticsPlugin {
  const endpoint =
    options.endpoint ?? "https://www.google-analytics.com/mp/collect";
  const fetcher = options.fetch ?? fetch;

  return {
    name: "ga4-measurement-protocol",
    async track(payload) {
      const clientId = payload.anonymousId ?? payload.userId ?? "server";
      const url = new URL(endpoint);
      url.searchParams.set("measurement_id", options.measurementId);
      url.searchParams.set("api_secret", options.apiSecret);

      await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          user_id: payload.userId,
          timestamp_micros: toMicros(payload.timestamp),
          events: [
            {
              name: payload.event,
              params: {
                ...payload.properties,
                source: payload.source,
                context: payload.context,
              },
            },
          ],
        }),
      });
    },
  };
}

function toMicros(timestamp?: Date): number | undefined {
  return timestamp ? timestamp.getTime() * 1000 : undefined;
}
