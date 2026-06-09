import { describe, expect, it } from "vitest";
import { createNoopAnalyticsPlugin } from "./noop.plugin";

describe("createNoopAnalyticsPlugin", () => {
  it("implements every analytics method without side effects", () => {
    const plugin = createNoopAnalyticsPlugin();

    expect(plugin.name).toBe("noop");
    expect(plugin.track?.({ event: "test" })).toBeUndefined();
    expect(plugin.identify?.({ userId: "user-1" })).toBeUndefined();
    expect(plugin.page?.({ path: "/" })).toBeUndefined();
  });
});
