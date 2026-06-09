import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
} from "../../../type";
import { AbstractAnalyticsProvider } from "../base";

export interface PostHogAnalyticsPluginOptions {
  apiKey: string;
  host?: string;
  fetch?: typeof fetch;
}

export class PostHogAnalyticsProvider extends AbstractAnalyticsProvider {
  readonly name = "posthog";

  private readonly captureUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PostHogAnalyticsPluginOptions) {
    super();
    this.fetcher = options.fetch ?? fetch;
    this.captureUrl = `${stripTrailingSlash(
      options.host ?? "https://app.posthog.com",
    )}/capture/`;
  }

  async track(payload: AnalyticsPayload): Promise<void> {
    await sendPostHogEvent(this.fetcher, this.captureUrl, this.options.apiKey, {
      event: payload.event,
      distinct_id: distinctId(payload),
      timestamp: payload.timestamp?.toISOString(),
      properties: compactObject({
        ...payload.properties,
        source: payload.source,
        context: payload.context,
        userId: payload.userId,
        anonymousId: payload.anonymousId,
      }),
    });
  }

  async identify(payload: AnalyticsIdentifyPayload): Promise<void> {
    await sendPostHogEvent(this.fetcher, this.captureUrl, this.options.apiKey, {
      event: "$identify",
      distinct_id: payload.userId,
      timestamp: payload.timestamp?.toISOString(),
      properties: compactObject({
        $set: payload.traits ?? {},
        context: payload.context,
      }),
    });
  }

  async page(payload: AnalyticsPagePayload): Promise<void> {
    await sendPostHogEvent(this.fetcher, this.captureUrl, this.options.apiKey, {
      event: "$pageview",
      distinct_id: pageDistinctId(payload),
      timestamp: payload.timestamp?.toISOString(),
      properties: compactObject({
        ...payload.properties,
        $current_url: payload.path,
        name: payload.name,
        context: payload.context,
      }),
    });
  }
}

async function sendPostHogEvent(
  fetcher: typeof fetch,
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`PostHog analytics request failed: ${response.status}`);
  }
}

function distinctId(payload: AnalyticsPayload): string {
  return payload.userId ?? payload.anonymousId ?? "server";
}

function pageDistinctId(payload: AnalyticsPagePayload): string {
  const contextDistinctId =
    typeof payload.context?.distinctId === "string"
      ? payload.context.distinctId
      : undefined;

  return contextDistinctId ?? "server";
}

function stripTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }

  return value.slice(0, end);
}

function compactObject<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
