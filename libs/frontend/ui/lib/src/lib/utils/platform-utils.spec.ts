import { describe, expect, it, vi } from "vitest";
import {
  add3DotsInTheStringMiddle,
  copyToClipboard,
  createSearchFunction,
  formatDateTime,
  formatNumber,
  formatPayTime,
  isTmaApp,
  openIfExists,
  transformToCountdown,
} from "./platform-utils";

describe("frontend platform utilities", () => {
  it("formats numbers with locale, grouping, and decimal options", () => {
    expect(formatNumber("12345.678", { decimals: 2 })).toBe("12,345.68");
    expect(formatNumber("€7,000", { useGrouping: false })).toBe("7000");
    expect(formatNumber("not-a-number")).toBe("not-a-number");
  });

  it("copies text with the injected clipboard writer and reports failures", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );

    await expect(copyToClipboard("secret", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("secret");

    await expect(
      copyToClipboard("secret", {
        writeText: vi.fn(() => Promise.reject(new Error("blocked"))),
      }),
    ).resolves.toBe(false);
    await expect(copyToClipboard("secret")).resolves.toBe(false);
  });

  it("formats pay time tokens", () => {
    expect(formatPayTime("minutes_15")).toBe("15 minutes");
    expect(formatPayTime("hours_1")).toBe("1 hour");
    expect(formatPayTime("soon")).toBe("soon");
  });

  it("creates exact-first search functions across selected fields", () => {
    const search = createSearchFunction<{
      code: string;
      name: string;
    }>(["code", "name"]);
    const items = [
      { code: "TON", name: "Toncoin" },
      { code: "USDT", name: "Tether USD" },
      { code: "USD", name: "Dollar" },
    ];

    expect(search(items, "usd")).toEqual([
      { code: "USD", name: "Dollar" },
      { code: "USDT", name: "Tether USD" },
    ]);
    expect(search(items, " ")).toEqual(items);
    expect(
      createSearchFunction<(typeof items)[number]>([])(items, "usd"),
    ).toEqual(items);
  });

  it("shortens long strings in the middle", () => {
    expect(add3DotsInTheStringMiddle("abcdef123456", 3)).toBe("abc...456");
    expect(add3DotsInTheStringMiddle("short", 3)).toBe("short");
  });

  it("detects Telegram mini app environments without requiring TMA globals", () => {
    expect(isTmaApp({ VITE_TMA_APP: "true" })).toBe(true);
    expect(isTmaApp({})).toBe(false);
  });

  it("transforms seconds to countdown strings", () => {
    expect(transformToCountdown(3_661)).toBe("01:01:01");
    expect(transformToCountdown(90_061)).toBe("1d 01:01:01");
    expect(transformToCountdown(-1)).toBe("00:00:00");
  });

  it("formats date-time values and preserves invalid input", () => {
    expect(
      formatDateTime("2024-01-02T03:04:00Z", {
        locale: "en-GB",
        timeZone: "UTC",
      }),
    ).toBe("2 Jan 2024, 03:04");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });

  it("opens existing URLs only when a browser opener is available", () => {
    const openedWindow = {} as Window;
    const open = vi
      .spyOn(window, "open")
      .mockImplementation(() => openedWindow);

    expect(openIfExists("https://example.test")).toBe(openedWindow);
    expect(open).toHaveBeenCalledWith(
      "https://example.test",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openIfExists(undefined)).toBeNull();
  });
});
