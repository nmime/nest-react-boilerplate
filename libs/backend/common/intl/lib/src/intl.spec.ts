import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IntlContext } from "./i18n-context";
import {
  randomIntlText,
  randomLocalizedText,
  resolveLocalizedText,
} from "./random-intl-text.util";
import { BotLangResolver } from "./resolver";

describe("@app/backend/common/intl", () => {
  it("owns locale context resolution without translation catalogs", () => {
    expect(IntlContext.resolve(" ru ")).toEqual({
      locale: "ru",
      fallbackLocale: "en",
    });
    expect(IntlContext.resolve(undefined, "ru")).toEqual({
      locale: "ru",
      fallbackLocale: "ru",
    });
  });

  it("resolves bot locale headers for formatting/text selection context", () => {
    const resolver = new BotLangResolver();

    expect(resolver.resolve({ "accept-language": "ru-RU, en;q=0.7" })).toBe(
      "ru-RU",
    );
    expect(resolver.resolve({ "x-locale": ["en-US"] })).toBe("en-US");
    expect(resolver.resolve()).toBe("en");
  });

  it("selects localized text with fallback but no translation-key lookup", () => {
    expect(resolveLocalizedText("plain", "ru")).toBe("plain");
    expect(resolveLocalizedText({ ru: "Привет", en: "Hello" }, "ru")).toBe(
      "Привет",
    );
    expect(resolveLocalizedText({ en: "Hello" }, "fr")).toBe("Hello");
    expect(resolveLocalizedText({ ru: "Привет" }, "fr")).toBe("Привет");
    expect(resolveLocalizedText({}, "fr")).toBe("");
  });

  it("does not depend on i18n translation catalogs or lookup", () => {
    const intlSourceRoot = join(__dirname);
    const indexSource = readFileSync(join(intlSourceRoot, "index.ts"), "utf8");
    const textHelperSource = readFileSync(
      join(intlSourceRoot, "random-intl-text.util.ts"),
      "utf8",
    );

    expect(indexSource).not.toContain("@app/common/i18n");
    expect(indexSource).not.toContain("decorator/" + "i18n");
    expect(textHelperSource).not.toContain("random" + "I18nText");
    expect(textHelperSource).not.toContain("translate(");
    expect(textHelperSource).not.toContain("translations");
  });

  it("keeps intl text helper export stable", () => {
    expect(randomIntlText).toBe(randomLocalizedText);
    expect(randomIntlText([], "en")).toBe("");
  });
});
