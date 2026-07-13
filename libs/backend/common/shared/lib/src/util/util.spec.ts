import { describe, expect, it } from "vitest";
import { Language } from "../const";
import { decodeCursor, encodeCursor } from "./cursor.util";
import { normalizeDateLocale } from "./date-fns-locale.util";
import { enumValues } from "./enum.util";
import { unknownToError } from "./error.util";
import { emptyGeoIpInfo } from "./geoip.util";
import { getLang } from "./get-lang.util";
import { getLocalization } from "./get.localization";
import { importAllFunctions } from "./import-all-functions.util";
import { groupByKey, mapByKey } from "./map-by-key.util";
import { nbsp } from "./nbsp.util";
import { parseFormattedCoin } from "./parse-formated-coin.util";
import { receiver } from "./receiver.util";
import { shuffleArray } from "./shuffle-array.util";
import { identityTransformer } from "./transformer";
import { validateRequired } from "./validate-required.util";
import { buildWebAppUrl } from "./web-app-url.util";
import { isValidWithdrawalComment } from "./withdrawal-comment.validator.util";

describe("cursor codec", () => {
  it("round-trips a value through base64url", () => {
    const encoded = encodeCursor("id:42");

    expect(encoded).not.toContain(":");
    expect(decodeCursor(encoded)).toBe("id:42");
  });
});

describe("normalizeDateLocale", () => {
  it("keeps only the primary subtag and defaults to en", () => {
    expect(normalizeDateLocale("en-US")).toBe("en");
    expect(normalizeDateLocale("ru-RU")).toBe("ru");
    expect(normalizeDateLocale()).toBe("en");
  });
});

describe("enumValues", () => {
  it("returns the runtime values of an enum-like object", () => {
    expect(enumValues({ A: "a", B: "b" })).toEqual(["a", "b"]);
  });
});

describe("unknownToError", () => {
  it("returns Error instances unchanged", () => {
    const error = new Error("boom");

    expect(unknownToError(error)).toBe(error);
  });

  it("wraps string values in an Error", () => {
    expect(unknownToError("failed").message).toBe("failed");
  });

  it("serializes non-string, non-Error values", () => {
    expect(unknownToError({ code: 7 }).message).toBe('{"code":7}');
  });
});

describe("emptyGeoIpInfo", () => {
  it("returns an empty geo info object", () => {
    expect(emptyGeoIpInfo()).toEqual({});
  });
});

describe("getLang", () => {
  it("defaults to English when no request is given", () => {
    expect(getLang()).toBe(Language.En);
  });

  it("prefers an explicit Russian locale", () => {
    expect(getLang({ locale: "ru-RU" })).toBe(Language.Ru);
  });

  it("falls back to a string accept-language header", () => {
    expect(getLang({ headers: { "accept-language": "ru,en" } })).toBe(
      Language.Ru,
    );
  });

  it("uses the first entry of an array accept-language header", () => {
    expect(getLang({ headers: { "accept-language": ["en-US", "ru"] } })).toBe(
      Language.En,
    );
  });
});

describe("getLocalization", () => {
  it("returns the requested locale when present", () => {
    expect(getLocalization({ en: "hi", ru: "привет" }, "ru")).toBe("привет");
  });

  it("falls back to the fallback locale", () => {
    expect(getLocalization({ en: "hi" }, "ru")).toBe("hi");
  });

  it("falls back to the first available value", () => {
    expect(getLocalization({ de: "hallo" }, "ru")).toBe("hallo");
  });
});

describe("importAllFunctions", () => {
  it("returns the same function map", () => {
    const map = { run: () => 1 };

    expect(importAllFunctions(map)).toBe(map);
  });
});

describe("mapByKey", () => {
  it("indexes values by a derived key", () => {
    const result = mapByKey([{ id: "a" }, { id: "b" }], (value) => value.id);

    expect(result.get("a")).toEqual({ id: "a" });
    expect(result.size).toBe(2);
  });
});

describe("groupByKey", () => {
  it("groups values sharing a key", () => {
    const result = groupByKey(
      [
        { team: "x", name: "a" },
        { team: "x", name: "b" },
        { team: "y", name: "c" },
      ],
      (value) => value.team,
    );

    expect(result.get("x")).toHaveLength(2);
    expect(result.get("y")).toHaveLength(1);
  });
});

describe("nbsp", () => {
  it("returns a non-breaking space", () => {
    expect(nbsp()).toBe(" ");
  });
});

describe("parseFormattedCoin", () => {
  it("strips separators before parsing", () => {
    expect(parseFormattedCoin("1,234_567 8")).toBe(12345678);
  });
});

describe("receiver / identityTransformer", () => {
  it("return their input unchanged", () => {
    const value = { a: 1 };

    expect(receiver(value)).toBe(value);
    expect(identityTransformer(value)).toBe(value);
  });
});

describe("shuffleArray", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];

    const result = shuffleArray(input);

    expect(result).not.toBe(input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles empty arrays", () => {
    expect(shuffleArray([])).toEqual([]);
  });
});

describe("validateRequired", () => {
  it("aliases readRequiredEnv", () => {
    expect(validateRequired({ TOKEN: " value " }, "TOKEN")).toBe("value");
  });
});

describe("buildWebAppUrl", () => {
  it("resolves a path against the base URL", () => {
    expect(buildWebAppUrl("https://app.example.com", "/settings")).toBe(
      "https://app.example.com/settings",
    );
  });

  it("appends query parameters", () => {
    expect(
      buildWebAppUrl("https://app.example.com", "/settings", {
        ref: "abc",
        tab: "profile",
      }),
    ).toBe("https://app.example.com/settings?ref=abc&tab=profile");
  });
});

describe("isValidWithdrawalComment", () => {
  it("accepts comments up to 255 characters and rejects longer ones", () => {
    expect(isValidWithdrawalComment("a".repeat(255))).toBe(true);
    expect(isValidWithdrawalComment("a".repeat(256))).toBe(false);
  });
});
