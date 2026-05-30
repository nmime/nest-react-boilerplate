import { describe, expect, it, vi } from "vitest";
import {
  I18nService,
  createRequestLocaleMiddleware,
  fallbackLocale,
  hasTranslationKey,
  interpolate,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromRequest,
  supportedLocales,
  translate,
} from "./index";

describe("@app/common/i18n", () => {
  it("translates keys with interpolation and fallback", () => {
    expect(translate("common.language", { locale: "ru" })).toBe("Язык");
    expect(translate("common.theme.dark", { locale: "en" })).toBe("Dark");
    expect(
      translate("user.state.ready", {
        locale: "en",
        params: { subject: "user-1" },
      }),
    ).toBe("Ready: user-1");
    expect(translate("common.ready", { locale: "fr-CA" })).toBe("Ready");
  });

  it("resolves locales from exact, regional, accept-language, and fallback values", () => {
    expect(supportedLocales).toEqual(["en", "ru"]);
    expect(fallbackLocale).toBe("en");
    expect(resolveLocale("ru-RU")).toBe("ru");
    expect(parseAcceptLanguage("fr-CA, ru;q=0.8, en;q=0.5")).toBe("ru");
    expect(resolveLocale("", "fr")).toBe("en");
  });

  it("resolves request locales by query, headers, cookies, and accept-language", () => {
    expect(
      resolveLocaleFromRequest({
        query: { lang: "ru" },
        headers: { "accept-language": "en" },
      }),
    ).toBe("ru");
    expect(
      resolveLocaleFromRequest({ headers: { "x-language": "ru-RU" } }),
    ).toBe("ru");
    expect(resolveLocaleFromRequest({ cookies: { locale: "ru" } })).toBe("ru");
    expect(resolveLocaleFromRequest({ url: "/health?locale=ru" })).toBe("ru");
  });

  it("handles defensive locale parsing and lookup branches", () => {
    expect(normalizeLocale("   ")).toBeUndefined();
    expect(parseAcceptLanguage("fr;q=oops, ru;q=0, en;q=0.4")).toBe("en");
    expect(resolveLocaleFromRequest({ query: { locale: ["ru"] } })).toBe("ru");
    expect(resolveLocaleFromRequest({ headers: { "x-locale": ["ru"] } })).toBe(
      "ru",
    );
    expect(resolveLocaleFromRequest({ cookies: { lang: "ru" } })).toBe("ru");
    expect(
      resolveLocaleFromRequest({ originalUrl: ["ht", "tp://["].join("") }),
    ).toBe("en");
    expect(resolveLocaleFromRequest({ url: "/health" })).toBe("en");
    expect(hasTranslationKey("common.ready")).toBe(true);
    expect(hasTranslationKey("missing.translation.key")).toBe(false);
    expect(interpolate("Hello {{ name }} {{missing}}", { name: "Ada" })).toBe(
      "Hello Ada {{missing}}",
    );

    const service = new I18nService();
    expect(service.translate("common.ready", { locale: "ru" })).toBe("Готово");
    expect(service.resolveLocale("ru-RU")).toBe("ru");
    expect(service.resolveLocaleFromRequest({ language: "ru" })).toBe("ru");
  });

  it("stores resolved locale on requests through middleware", () => {
    const request = { headers: { "accept-language": "ru" } };
    const next = vi.fn();
    createRequestLocaleMiddleware(new I18nService())(request, {}, next);
    expect(request).toMatchObject({ language: "ru", locale: "ru" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
