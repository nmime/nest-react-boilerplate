import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiscordNavigationStateService,
  type DiscordNavigationState,
} from "./discord-navigation-state.service";

function state(
  nonce: string,
  expiresAt: Date,
  overrides: Partial<DiscordNavigationState> = {},
): DiscordNavigationState {
  return {
    nonce,
    action: "home",
    userId: "123456789012345678",
    tenantId: "00000000-0000-0000-0000-000000000000",
    locale: "en",
    path: ["home"],
    expiresAt,
    ...overrides,
  };
}

describe("DiscordNavigationStateService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores state and returns an isolated copy", () => {
    const service = new DiscordNavigationStateService();
    service.put(
      state("n1", new Date(Date.now() + 60_000), {
        data: { step: "home" },
      }),
    );

    const first = service.get("n1");
    expect(first).toMatchObject({ nonce: "n1", action: "home" });
    first?.path.push("mutated");
    if (first?.data) {
      first.data.injected = true;
    }

    expect(service.get("n1")?.path).toEqual(["home"]);
    expect(service.get("n1")?.data).toEqual({ step: "home" });
  });

  it("returns null for missing and expired entries and evicts the expired one", () => {
    const service = new DiscordNavigationStateService();
    service.put(state("expired", new Date(Date.now() - 1_000)));

    expect(service.get("missing")).toBeNull();
    expect(service.get("expired")).toBeNull();
    // A second read confirms the expired entry was removed on the first read.
    expect(service.get("expired")).toBeNull();
  });

  it("evicts entries that expire between write and read", () => {
    const service = new DiscordNavigationStateService();
    const expiresAt = new Date(Date.now() + 1_000);
    service.put(state("n1", expiresAt));

    expect(service.get("n1", new Date(expiresAt.getTime() + 1))).toBeNull();
    expect(service.get("n1")).toBeNull();
  });

  it("reports whether a delete removed an entry", () => {
    const service = new DiscordNavigationStateService();
    service.put(state("n1", new Date(Date.now() + 60_000)));

    expect(service.delete("n1")).toBe(true);
    expect(service.delete("n1")).toBe(false);
  });

  it("sweeps expired entries on a time-gated write", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const service = new DiscordNavigationStateService();
    service.put(state("stale", new Date(Date.now() + 1_000)));

    vi.setSystemTime(new Date("2030-01-01T00:05:00.000Z"));
    service.put(state("fresh", new Date(Date.now() + 60_000)));

    expect(service.get("stale")).toBeNull();
    expect(service.get("fresh")).not.toBeNull();
  });

  it("evicts the oldest entry once capacity is exceeded", () => {
    const service = new DiscordNavigationStateService();
    const future = new Date(Date.now() + 3_600_000);
    for (let index = 0; index <= 10_000; index += 1) {
      service.put(state(`n${index}`, future));
    }

    expect(service.get("n0")).toBeNull();
    expect(service.get("n10000")).not.toBeNull();
  });
});
