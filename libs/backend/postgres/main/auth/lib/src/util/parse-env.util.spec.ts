import { describe, expect, it } from "vitest";
import { parseBoolean, parsePositiveInteger } from "./parse-env.util";

describe("parseBoolean", () => {
  it("returns the fallback for undefined or blank values", () => {
    expect(parseBoolean(undefined, true)).toBe(true);
    expect(parseBoolean("   ", false)).toBe(false);
  });

  it("parses truthy and falsy tokens case-insensitively", () => {
    expect(parseBoolean("TRUE", false)).toBe(true);
    expect(parseBoolean("yes", false)).toBe(true);
    expect(parseBoolean("On", false)).toBe(true);
    expect(parseBoolean("0", true)).toBe(false);
    expect(parseBoolean("Off", true)).toBe(false);
    expect(parseBoolean("no", true)).toBe(false);
  });

  it("returns the fallback for unrecognized tokens", () => {
    expect(parseBoolean("maybe", true)).toBe(true);
    expect(parseBoolean("maybe", false)).toBe(false);
  });
});

describe("parsePositiveInteger", () => {
  it("returns the fallback for undefined or blank values", () => {
    expect(parsePositiveInteger(undefined, 60_000, 1_000)).toBe(60_000);
    expect(parsePositiveInteger("  ", 60_000, 1_000)).toBe(60_000);
  });

  it("clamps parsed integers up to the minimum", () => {
    expect(parsePositiveInteger("500", 60_000, 1_000)).toBe(1_000);
    expect(parsePositiveInteger("5000", 60_000, 1_000)).toBe(5_000);
  });

  it("returns the fallback for non-integer or non-positive values", () => {
    expect(parsePositiveInteger("60000ms", 3_600_000, 1_000)).toBe(3_600_000);
    expect(parsePositiveInteger("-5", 3_600_000, 1_000)).toBe(3_600_000);
    expect(parsePositiveInteger("0", 3_600_000, 1_000)).toBe(3_600_000);
  });
});
