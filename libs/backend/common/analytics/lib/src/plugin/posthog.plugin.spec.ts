import { describe, expect, it, vi } from "vitest";
import { createPostHogAnalyticsPlugin } from "./posthog.plugin";

describe("createPostHogAnalyticsPlugin", () => {
  it("maps track payloads to PostHog capture events", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createPostHogAnalyticsPlugin({
      apiKey: "ph-key",
      host: "https://posthog.example.com/",
      fetch: fetcher,
    });
    const timestamp = new Date("2024-01-02T03:04:05.000Z");

    await plugin.track?.({
      event: "order_created",
      userId: "user-1",
      anonymousId: "anon-1",
      source: "backend",
      properties: { plan: "pro" },
      context: { requestId: "req-1" },
      timestamp,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://posthog.example.com/capture/",
      expect.objectContaining({ method: "POST" }),
    );
    const [, requestInit] = fetcher.mock.calls[0] ?? [];
    const body = readJsonBody<Record<string, unknown>>(requestInit);
    expect(body).toMatchObject({
      api_key: "ph-key",
      event: "order_created",
      distinct_id: "user-1",
      timestamp: timestamp.toISOString(),
      properties: {
        plan: "pro",
        source: "backend",
        context: { requestId: "req-1" },
        userId: "user-1",
        anonymousId: "anon-1",
      },
    });
  });

  it("throws when PostHog rejects the event", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const plugin = createPostHogAnalyticsPlugin({
      apiKey: "ph-key",
      fetch: fetcher,
    });

    await expect(plugin.track?.({ event: "failed" })).rejects.toThrow(
      "PostHog analytics request failed: 500",
    );
  });
});

function readJsonBody<T>(requestInit: RequestInit | undefined): T {
  if (typeof requestInit?.body !== "string") {
    throw new TypeError("Expected fetch body to be a JSON string.");
  }

  return JSON.parse(requestInit.body) as T;
}
