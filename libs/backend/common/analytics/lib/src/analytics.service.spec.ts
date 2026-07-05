import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsConfigService } from "./config";
import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
  AnalyticsPlugin,
} from "./type";

const flush = async (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

interface RecordingPlugin extends AnalyticsPlugin {
  track: Mock<(payload: AnalyticsPayload) => Promise<void>>;
  identify: Mock<(payload: AnalyticsIdentifyPayload) => Promise<void>>;
  page: Mock<(payload: AnalyticsPagePayload) => Promise<void>>;
}

function recordingPlugin(name = "test"): RecordingPlugin {
  return {
    name,
    track: vi
      .fn<(payload: AnalyticsPayload) => Promise<void>>()
      .mockResolvedValue(undefined),
    identify: vi
      .fn<(payload: AnalyticsIdentifyPayload) => Promise<void>>()
      .mockResolvedValue(undefined),
    page: vi
      .fn<(payload: AnalyticsPagePayload) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

describe("AnalyticsService", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the configured environment", () => {
    const service = new AnalyticsService(
      new AnalyticsConfigService({ environment: "staging" }),
    );

    expect(service.environment).toBe("staging");
  });

  it("dispatches identify payloads with a generated timestamp", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [plugin] }),
    );

    await service.identify("user-1", { plan: "pro" }, { requestId: "req-1" });

    expect(plugin.identify).toHaveBeenCalledTimes(1);
    expect(plugin.identify.mock.calls[0]?.[0]).toMatchObject({
      userId: "user-1",
      traits: { plan: "pro" },
      context: { requestId: "req-1" },
    });
    expect(plugin.identify.mock.calls[0]?.[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("dispatches track events fire-and-forget with a default timestamp", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [plugin] }),
    );

    service.track("order_created", { seats: 3 }, { source: "backend" });
    await flush();

    expect(plugin.track).toHaveBeenCalledTimes(1);
    expect(plugin.track.mock.calls[0]?.[0]).toMatchObject({
      event: "order_created",
      properties: { seats: 3 },
      source: "backend",
    });
    expect(plugin.track.mock.calls[0]?.[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("preserves an explicit timestamp on track events", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [plugin] }),
    );
    const timestamp = new Date("2024-01-02T03:04:05.000Z");

    service.track("order_created", undefined, { timestamp });
    await flush();

    expect(plugin.track.mock.calls[0]?.[0]?.timestamp).toBe(timestamp);
  });

  it("dispatches page views, defaulting the timestamp", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [plugin] }),
    );

    await service.page({ name: "Home", path: "/" });

    expect(plugin.page.mock.calls[0]?.[0]).toMatchObject({
      name: "Home",
      path: "/",
    });
    expect(plugin.page.mock.calls[0]?.[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("preserves an explicit page timestamp and supports empty payloads", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [plugin] }),
    );
    const timestamp = new Date("2024-05-06T07:08:09.000Z");

    await service.page({ timestamp });
    await service.page();

    expect(plugin.page.mock.calls[0]?.[0]?.timestamp).toBe(timestamp);
    expect(plugin.page.mock.calls[1]?.[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("does nothing when analytics are disabled", async () => {
    const plugin = recordingPlugin();
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: false, plugins: [plugin] }),
    );

    await service.identify("user-1");
    await service.page();
    service.track("noop");
    await flush();

    expect(plugin.identify).not.toHaveBeenCalled();
    expect(plugin.page).not.toHaveBeenCalled();
    expect(plugin.track).not.toHaveBeenCalled();
  });

  it("isolates plugin failures and keeps other plugins running", async () => {
    const failing = recordingPlugin("failing");
    failing.track.mockRejectedValue(new Error("sink down"));
    const healthy = recordingPlugin("healthy");
    const service = new AnalyticsService(
      new AnalyticsConfigService({
        enabled: true,
        plugins: [failing, healthy],
      }),
    );

    service.track("order_created");
    await flush();

    expect(healthy.track).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Analytics plugin "failing" failed',
      expect.any(Error),
    );
  });

  it("skips plugins that do not implement the dispatched method", async () => {
    const partial: AnalyticsPlugin = { name: "partial" };
    const service = new AnalyticsService(
      new AnalyticsConfigService({ enabled: true, plugins: [partial] }),
    );

    await expect(service.identify("user-1")).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("guards track against a rejected dispatch to avoid unhandled rejections", async () => {
    const fakeConfig = {
      environment: "test",
      get enabled(): boolean {
        return true;
      },
      get plugins(): AnalyticsPlugin[] {
        throw new Error("config exploded");
      },
    } as unknown as AnalyticsConfigService;
    const service = new AnalyticsService(fakeConfig);

    service.track("order_created");
    await flush();

    expect(errorSpy).toHaveBeenCalledWith(
      'Analytics track for "order_created" failed',
      expect.any(Error),
    );
  });
});
