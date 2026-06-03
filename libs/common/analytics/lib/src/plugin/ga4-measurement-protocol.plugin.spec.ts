import { describe, expect, it, vi } from "vitest";
import { createGa4MeasurementProtocolPlugin } from "./ga4-measurement-protocol.plugin";

interface Ga4RequestBody {
  client_id: string;
  user_id?: string;
  timestamp_micros?: number;
  events: Array<{ name: string; params: Record<string, unknown> }>;
}

describe("createGa4MeasurementProtocolPlugin", () => {
  it("maps timestamps and context to GA4 Measurement Protocol params", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createGa4MeasurementProtocolPlugin({
      measurementId: "G-TEST",
      apiSecret: "test-secret",
      endpoint: "https://www.google-analytics.com/mp/collect",
      fetch: fetcher,
    });
    const timestamp = new Date("2024-01-02T03:04:05.006Z");

    await plugin.track?.({
      event: "order_created",
      userId: "user-1",
      anonymousId: "anon-1",
      source: "backend",
      properties: {
        plan: "pro",
        seats: 3,
        active: true,
        nested: { tier: "gold" },
        omitted: undefined,
      },
      context: {
        requestId: "req-1",
        nested: { traceId: "trace-1" },
        count: 2,
        flag: false,
      },
      timestamp,
    });

    const [requestUrl, requestInit] = fetcher.mock.calls[0] ?? [];
    const body = readJsonBody<Ga4RequestBody>(requestInit);

    expect(requestUrl).toBeInstanceOf(URL);

    expect((requestUrl as URL).searchParams.get("measurement_id")).toBe(
      "G-TEST",
    );
    expect((requestUrl as URL).searchParams.get("api_secret")).toBe(
      "test-secret",
    );
    expect(body).toMatchObject({
      client_id: "anon-1",
      user_id: "user-1",
      timestamp_micros: timestamp.getTime() * 1000,
      events: [
        {
          name: "order_created",
          params: {
            plan: "pro",
            seats: 3,
            active: "true",
            nested: JSON.stringify({ tier: "gold" }),
            source: "backend",
            context_requestId: "req-1",
            context_nested: JSON.stringify({ traceId: "trace-1" }),
            context_count: 2,
            context_flag: "false",
          },
        },
      ],
    });
    expect(body.events[0].params).not.toHaveProperty("context");
    expect(body.events[0].params).not.toHaveProperty("omitted");
  });
});

function readJsonBody<T>(requestInit: RequestInit | undefined): T {
  if (typeof requestInit?.body !== "string") {
    throw new TypeError("Expected fetch body to be a JSON string.");
  }

  return JSON.parse(requestInit.body) as T;
}
