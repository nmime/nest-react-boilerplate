import { describe, expect, it } from "vitest";
import {
  AbstractAnalyticsProvider,
  Ga4MeasurementProtocolProvider,
  LoggerAnalyticsProvider,
  NoopAnalyticsProvider,
  PostHogAnalyticsProvider,
  UmamiAnalyticsProvider,
} from "./index";
import {
  createGa4MeasurementProtocolPlugin,
  createLoggerAnalyticsPlugin,
  createNoopAnalyticsPlugin,
  createPostHogAnalyticsPlugin,
  createUmamiAnalyticsPlugin,
} from "../index";

describe("analytics providers", () => {
  it("keeps every provider implementation behind the abstract base class", () => {
    const fetcher = viFetch();

    const providers = [
      createNoopAnalyticsPlugin(),
      createLoggerAnalyticsPlugin(),
      createGa4MeasurementProtocolPlugin({
        measurementId: "G-TEST",
        apiSecret: "secret",
        fetch: fetcher,
      }),
      createPostHogAnalyticsPlugin({ apiKey: "ph-key", fetch: fetcher }),
      createUmamiAnalyticsPlugin({
        websiteId: "website-id",
        endpoint: "https://umami.example.com/api/send",
        fetch: fetcher,
      }),
    ];

    for (const provider of providers) {
      expect(provider).toBeInstanceOf(AbstractAnalyticsProvider);
    }
  });

  it("exports provider classes from provider folders", () => {
    expect(Ga4MeasurementProtocolProvider.prototype).toBeInstanceOf(
      AbstractAnalyticsProvider,
    );
    expect(LoggerAnalyticsProvider.prototype).toBeInstanceOf(
      AbstractAnalyticsProvider,
    );
    expect(NoopAnalyticsProvider.prototype).toBeInstanceOf(
      AbstractAnalyticsProvider,
    );
    expect(PostHogAnalyticsProvider.prototype).toBeInstanceOf(
      AbstractAnalyticsProvider,
    );
    expect(UmamiAnalyticsProvider.prototype).toBeInstanceOf(
      AbstractAnalyticsProvider,
    );
  });
});

function viFetch(): typeof fetch {
  const fetcher: typeof fetch = () => Promise.resolve(new Response(null));

  return fetcher;
}
