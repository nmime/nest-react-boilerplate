import type { AnalyticsPayload } from "../../../type";
import { AbstractAnalyticsProvider } from "../base";

export interface Ga4MeasurementProtocolPluginOptions {
  measurementId: string;
  apiSecret: string;
  endpoint?: string;
  fetch?: typeof fetch;
}

type Ga4ParamValue = string | number;

export class Ga4MeasurementProtocolProvider extends AbstractAnalyticsProvider {
  readonly name = "ga4-measurement-protocol";

  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: Ga4MeasurementProtocolPluginOptions) {
    super();
    this.endpoint =
      options.endpoint ?? "https://www.google-analytics.com/mp/collect";
    this.fetcher = options.fetch ?? fetch;
  }

  async track(payload: AnalyticsPayload): Promise<void> {
    const clientId = payload.anonymousId ?? payload.userId ?? "server";
    const url = new URL(this.endpoint);
    url.searchParams.set("measurement_id", this.options.measurementId);
    url.searchParams.set("api_secret", this.options.apiSecret);

    await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        user_id: payload.userId,
        timestamp_micros: toMicros(payload.timestamp),
        events: [
          {
            name: payload.event,
            params: buildGa4EventParams(payload),
          },
        ],
      }),
    });
  }
}

function buildGa4EventParams(
  payload: AnalyticsPayload,
): Record<string, Ga4ParamValue> {
  return compactObject({
    ...normalizeParamRecord(payload.properties),
    source: normalizeGa4ParamValue(payload.source),
    ...normalizeContextParams(payload.context),
  });
}

function normalizeContextParams(
  context?: Record<string, unknown>,
): Record<string, Ga4ParamValue> {
  return Object.fromEntries(
    Object.entries(normalizeParamRecord(context)).map(([key, value]) => [
      `context_${key}`,
      value,
    ]),
  );
}

function normalizeParamRecord(
  record?: Record<string, unknown>,
): Record<string, Ga4ParamValue> {
  return compactObject(
    Object.fromEntries(
      Object.entries(record ?? {}).map(([key, value]) => [
        key,
        normalizeGa4ParamValue(value),
      ]),
    ),
  );
}

// GA4 Measurement Protocol accepts finite numeric params alongside strings.
// eslint-disable-next-line sonarjs/function-return-type -- GA4 accepts strings and finite numbers, while unsupported values are omitted.
function normalizeGa4ParamValue(value: unknown): Ga4ParamValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  try {
    return JSON.stringify(value) ?? undefined;
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function compactObject<T extends Record<string, unknown>>(
  value: T,
): Record<string, Ga4ParamValue> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Record<string, Ga4ParamValue>;
}

function toMicros(timestamp?: Date): number | undefined {
  return timestamp ? timestamp.getTime() * 1000 : undefined;
}
