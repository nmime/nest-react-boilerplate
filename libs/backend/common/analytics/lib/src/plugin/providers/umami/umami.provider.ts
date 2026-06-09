import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
} from "../../../type";
import { AbstractAnalyticsProvider } from "../base";

export interface UmamiAnalyticsPluginOptions {
  websiteId: string;
  endpoint?: string;
  host?: string;
  hostname?: string;
  fetch?: typeof fetch;
}

export class UmamiAnalyticsProvider extends AbstractAnalyticsProvider {
  readonly name = "umami";

  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly hostname: string;

  constructor(private readonly options: UmamiAnalyticsPluginOptions) {
    super();
    this.fetcher = options.fetch ?? fetch;
    this.endpoint = resolveUmamiEndpoint(options);
    this.hostname = options.hostname ?? "server";
  }

  async track(payload: AnalyticsPayload): Promise<void> {
    await sendUmamiEvent(this.fetcher, this.endpoint, {
      website: this.options.websiteId,
      hostname: this.hostname,
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
  }

  async identify(payload: AnalyticsIdentifyPayload): Promise<void> {
    await sendUmamiEvent(this.fetcher, this.endpoint, {
      website: this.options.websiteId,
      hostname: this.hostname,
      name: "identify",
      data: compactObject({
        userId: payload.userId,
        traits: payload.traits,
        context: payload.context,
        timestamp: payload.timestamp?.toISOString(),
      }),
    });
  }

  async page(payload: AnalyticsPagePayload): Promise<void> {
    await sendUmamiEvent(this.fetcher, this.endpoint, {
      website: this.options.websiteId,
      hostname: this.hostname,
      url: payload.path,
      title: payload.name,
      name: payload.name ?? "pageview",
      data: compactObject({
        ...payload.properties,
        context: payload.context,
        timestamp: payload.timestamp?.toISOString(),
      }),
    });
  }
}

function resolveUmamiEndpoint(options: UmamiAnalyticsPluginOptions): string {
  const endpoint = options.endpoint?.trim();
  if (endpoint) {
    return endpoint;
  }

  const host = options.host?.trim();
  if (host) {
    return `${stripTrailingSlash(host)}/api/send`;
  }

  throw new Error(
    "Umami analytics requires either endpoint or host when websiteId is configured.",
  );
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
