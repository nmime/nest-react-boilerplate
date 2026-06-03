import { describe, expect, it, vi } from "vitest";
import { createUmamiAnalyticsPlugin } from "./umami.plugin";

describe("createUmamiAnalyticsPlugin", () => {
  it("maps track payloads to Umami events", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createUmamiAnalyticsPlugin({
      websiteId: "website-id",
      endpoint: "https://umami.example.com/api/send",
      hostname: "api.example.com",
      fetch: fetcher,
    });
    const timestamp = new Date("2024-01-02T03:04:05.000Z");

    await plugin.track?.({
      event: "order_created",
      userId: "user-1",
      source: "backend",
      properties: { plan: "pro" },
      context: { requestId: "req-1" },
      timestamp,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://umami.example.com/api/send",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      type: "event",
      payload: {
        website: "website-id",
        hostname: "api.example.com",
        name: "order_created",
        data: {
          plan: "pro",
          source: "backend",
          context: { requestId: "req-1" },
          userId: "user-1",
          timestamp: timestamp.toISOString(),
        },
      },
    });
  });

  it("uses an explicit endpoint without appending /api/send", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createUmamiAnalyticsPlugin({
      websiteId: "website-id",
      endpoint: "https://analytics.example.com/custom",
      host: "https://umami.example.com",
      fetch: fetcher,
    });

    await plugin.page?.({ name: "Home", path: "/" });

    expect(fetcher.mock.calls[0]?.[0]).toBe("https://analytics.example.com/custom");
  });

  it("builds /api/send endpoint from host", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const plugin = createUmamiAnalyticsPlugin({
      websiteId: "website-id",
      host: "https://umami.example.com/",
      fetch: fetcher,
    });

    await plugin.page?.({ name: "Home", path: "/" });

    expect(fetcher.mock.calls[0]?.[0]).toBe("https://umami.example.com/api/send");
  });

  it("rejects missing endpoint and host instead of constructing a relative URL", () => {
    expect(() =>
      createUmamiAnalyticsPlugin({ websiteId: "website-id" }),
    ).toThrow("Umami analytics requires either endpoint or host");
  });
});
