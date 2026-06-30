import {
  installFixedSystemTime,
  uninstallFixedSystemTime,
  advanceFixedSystemTime,
  withFixedSystemTime,
} from "./deterministic-clock";
import { describe, it, expect, afterEach } from "vitest";

describe("deterministic-clock helpers", () => {
  afterEach(() => {
    uninstallFixedSystemTime();
  });

  it("installs a fixed Date.now() and new Date()", () => {
    const base = new Date("2025-06-15T10:30:00Z");
    installFixedSystemTime(base);
    expect(Date.now()).toBe(base.getTime());
    expect(new Date()).toEqual(base);
    uninstallFixedSystemTime();
  });

  it("advances the fixed clock", () => {
    const base = new Date("2025-01-01T00:00:00Z");
    installFixedSystemTime(base);
    expect(Date.now()).toBe(1735689600000);
    advanceFixedSystemTime(60_000);
    expect(Date.now()).toBe(1735689660000);
    advanceFixedSystemTime(-30_000);
    expect(Date.now()).toBe(1735689630000);
    advanceFixedSystemTime(5 * 60 * 1000);
    expect(Date.now()).toBe(1735689930000);
    uninstallFixedSystemTime();
  });

  it("restores real timers after uninstall", () => {
    installFixedSystemTime(new Date("2025-01-01"));
    expect(Date.now()).toBe(1735689600000);
    uninstallFixedSystemTime();
    expect(Date.now()).toBeGreaterThan(1735689600000);
  });

  it("uninstall is idempotent", () => {
    expect(() => uninstallFixedSystemTime()).not.toThrow();
  });

  it("throws when installing twice without uninstall", () => {
    installFixedSystemTime(new Date("2025-01-01"));
    expect(() => installFixedSystemTime(new Date("2025-02-01"))).toThrow(
      "Fixed system time is already installed",
    );
    uninstallFixedSystemTime();
  });

  it("throws when advancing without install", () => {
    expect(() => advanceFixedSystemTime(1000)).toThrow(
      "No fixed system time is installed",
    );
  });

  it("withFixedSystemTime provides isolated fixed clock", async () => {
    const base = new Date("2025-03-15T12:00:00Z");
    let capturedTime: number;
    await withFixedSystemTime(base, () => {
      capturedTime = Date.now();
      advanceFixedSystemTime(120_000);
    });
    expect(capturedTime).toBe(base.getTime());
    expect(Date.now()).toBeGreaterThan(base.getTime());
  });

  it("withFixedSystemTime restores timers even on error", async () => {
    await expect(
      withFixedSystemTime(new Date("2025-06-01"), () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(Date.now()).toBeGreaterThan(1748736000000);
  });

  it("uses default base time of 2025-01-01T00:00:00Z", () => {
    installFixedSystemTime();
    expect(Date.now()).toBe(1735689600000);
    uninstallFixedSystemTime();
  });
});
