import { describe, expect, it, vi } from "vitest";
import {
  I18nService,
  createRequestLocaleMiddleware,
  fallbackLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromRequest,
  supportedLocales,
  translate,
} from "./index";

describe("@app/common/i18n", () => {
  it("translates keys with interpolation and fallback", () => {
    expect(translate("common.language", { locale: "es" })).toBe("Idioma");
    expect(
      translate("user.state.ready", {
        locale: "en",
        params: { subject: "user-1" },
      }),
    ).toBe("Ready: user-1");
    expect(translate("common.ready", { locale: "fr-CA" })).toBe("Ready");
  });

  it("resolves locales from exact, regional, accept-language, and fallback values", () => {
    expect(supportedLocales).toEqual(["en", "es"]);
    expect(fallbackLocale).toBe("en");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(parseAcceptLanguage("fr-CA, es;q=0.8, en;q=0.5")).toBe("es");
    expect(resolveLocale("", "fr")).toBe("en");
  });

  it("resolves request locales by query, headers, cookies, and accept-language", () => {
    expect(
      resolveLocaleFromRequest({
        query: { lang: "es" },
        headers: { "accept-language": "en" },
      }),
    ).toBe("es");
    expect(
      resolveLocaleFromRequest({ headers: { "x-language": "es-MX" } }),
    ).toBe("es");
    expect(resolveLocaleFromRequest({ cookies: { locale: "es" } })).toBe("es");
    expect(resolveLocaleFromRequest({ url: "/health?locale=es" })).toBe("es");
  });

  it("stores resolved locale on requests through middleware", () => {
    const request = { headers: { "accept-language": "es" } };
    const next = vi.fn();
    createRequestLocaleMiddleware(new I18nService())(request, {}, next);
    expect(request).toMatchObject({ language: "es", locale: "es" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
