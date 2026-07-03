import { vi } from "vitest";

let fakeTimerActive = false;

export function installFixedSystemTime(
  baseTime: Date = new Date("2025-01-01T00:00:00Z"),
): number {
  if (fakeTimerActive) {
    throw new Error(
      "Fixed system time is already installed. Call uninstallFixedSystemTime() first or use withFixedSystemTime().",
    );
  }
  vi.useFakeTimers({ toFake: ["Date"], now: baseTime });
  fakeTimerActive = true;
  return baseTime.getTime();
}

export function uninstallFixedSystemTime(): void {
  if (fakeTimerActive) {
    vi.useRealTimers();
    fakeTimerActive = false;
  }
}

export function advanceFixedSystemTime(ms: number): void {
  if (!fakeTimerActive) {
    throw new Error(
      "No fixed system time is installed. Call installFixedSystemTime() first.",
    );
  }
  if (ms >= 0) {
    vi.advanceTimersByTime(ms);
  } else {
    vi.setSystemTime(new Date(Date.now() + ms));
  }
}

export async function withFixedSystemTime<T>(
  baseTime: Date,
  fn: () => T | Promise<T>,
): Promise<T> {
  installFixedSystemTime(baseTime);
  try {
    return await fn();
  } finally {
    uninstallFixedSystemTime();
  }
}
