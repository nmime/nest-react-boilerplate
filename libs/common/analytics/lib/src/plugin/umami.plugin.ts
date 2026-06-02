import type { AnalyticsPlugin } from "../type";

export interface UmamiAnalyticsPluginOptions {
  websiteId: string;
  endpoint?: string;
  host?: string;
  hostname?: string;
  fetch?: typeof fetch;
}

export function createUmamiAnalyticsPlugin(
  options: UmamiAnalyticsPluginOptions,
): AnalyticsPlugin {
  const fetcher = options.fetch ?? fetch;
  const endpoint =
    options.endpoint ?? `${stripTrailingSlash(options.host ?? "")}/api/send`;
  const hostname = options.hostname ?? "server";

  return {
    name: "umami",
    async track(payload) {
      await sendUmamiEvent(fetcher, endpoint, {
        website: options.websiteId,
        hostname,
        name: payload.event,
        data: compactObject({
          ...payload.properties,
          source: payload.source,
          context: payload.context,
          userId: payload.userId,
          anonymousId: payload.anonymousId,
          timestamp: payload.timestamp?.toISOString(),
        }),
      });
    },
    async identify(payload) {
      await sendUmamiEvent(fetcher, endpoint, {
        website: options.websiteId,
        hostname,
        name: "identify",
        data: compactObject({
          userId: payload.userId,
          traits: payload.traits,
          context: payload.context,
          timestamp: payload.timestamp?.toISOString(),
        }),
      });
    },
    async page(payload) {
      await sendUmamiEvent(fetcher, endpoint, {
        website: options.websiteId,
        hostname,
        url: payload.path,
        title: payload.name,
        name: payload.name ?? "pageview",
        data: compactObject({
          ...payload.properties,
          context: payload.context,
          timestamp: payload.timestamp?.toISOString(),
        }),
      });
    },
  };
}

async function sendUmamiEvent(
  fetcher: typeof fetch,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "event", payload }),
  });

  if (!response.ok) {
    throw new Error(`Umami analytics request failed: ${response.status}`);
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
