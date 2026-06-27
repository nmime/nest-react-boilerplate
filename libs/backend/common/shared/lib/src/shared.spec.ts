import { describe, expect, it } from "vitest";
import {
  isNonEmptyString,
  maskSecret,
  normalizeStringList,
  readRequiredEnv,
  uniqueStrings,
} from "./index";

describe("@app/backend/common/shared", () => {
  it("deduplicates strings while preserving order", () => {
    expect(uniqueStrings(["admin", "admin", "support"])).toEqual([
      "admin",
      "support",
    ]);
  });

  it("detects non-empty strings after trimming", () => {
    expect(isNonEmptyString(" token ")).toBe(true);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
  });

  it("normalizes array, string, and unsupported values fail-closed", () => {
    expect(normalizeStringList([" admin ", "", "ops", "admin", 42])).toEqual([
      "admin",
      "ops",
    ]);
    expect(normalizeStringList("admin ops,profile:read admin")).toEqual([
      "admin",
      "ops",
      "profile:read",
    ]);
    expect(normalizeStringList(null)).toEqual([]);
  });

  it("reads required environment variables and rejects missing values", () => {
    expect(readRequiredEnv({ TOKEN: " value " }, "TOKEN")).toBe("value");
    expect(() => readRequiredEnv({ TOKEN: " " }, "TOKEN")).toThrow(
      "TOKEN is required.",
    );
  });

  it("masks configured and missing secrets safely", () => {
    expect(maskSecret(undefined)).toBe("not-configured");
    expect(maskSecret("short")).toBe("********");
    expect(maskSecret("abcd-very-secret-efgh")).toBe("abcd…efgh");
  });
});
