import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  translations,
  type Locale,
  type LocaleCatalog,
} from "./index";

describe("@app/common/i18n", () => {
  it("loads translation catalogs from top-level locale JSON files", () => {
    const localesPath = join(__dirname, "..", "..", "..", "..", "..", "i18n");
    const english = JSON.parse(
      readFileSync(join(localesPath, "en", "common.json"), "utf8"),
    ) as Record<string, string>;
    const russian = JSON.parse(
      readFileSync(join(localesPath, "ru", "common.json"), "utf8"),
    ) as Record<string, string>;

    expect(translations.en).toEqual(english);
    expect(translations.ru).toEqual(russian);
    expect(english["common.language"]).toBe("Language");
    expect(russian["common.language"]).toBe("Язык");
  });

  it("exposes RFC 9457 validation and rate-limit translation keys", () => {
    const requiredKeys = [
      "errors.client-data-validation.title",
      "errors.client-data-validation.detail",
      "errors.rate-limited.title",
      "errors.rate-limited.detail",
      "validation.constraints.isInt",
      "validation.constraints.min",
      "validation.constraints.max",
      "validation.constraints.isIn",
      "validation.constraints.isUuid",
      "validation.constraints.isArray",
    ];

    for (const key of requiredKeys) {
      expect(hasTranslationKey(key)).toBe(true);
      expect(translations.en[key]).toEqual(expect.any(String));
      expect(translations.ru[key]).toEqual(expect.any(String));
    }
  });

  it("exposes planned social auth, TMA, bot, and Discord translation keys", () => {
    const requiredKeys = [
      "auth.provider.telegram",
      "auth.provider.discord",
      "auth.social.button.telegram",
      "auth.social.conflict.accountExists",
      "auth.social.stepUp.required",
      "auth.social.lastMethod.blocked",
      "auth.social.unlink.success",
      "auth.social.link.error",
      "auth.social.createAccount.error",
      "tma.loading",
      "tma.unsupported",
      "tma.authenticated",
      "tma.link.required",
      "tma.deepNavigation.notFound",
      "deepNav.linkRequired",
      "bot.menu.main",
      "bot.menu.profile",
      "bot.menu.settings",
      "bot.menu.language",
      "bot.menu.support",
      "bot.menu.link",
      "bot.menu.unlink",
      "bot.menu.back",
      "bot.menu.home",
      "bot.menu.cancel",
      "bot.error.expired",
      "bot.error.rateLimited",
      "discord.commands.link.label",
      "discord.commands.link.description",
      "discord.commands.status.label",
      "discord.commands.status.description",
      "discord.commands.help.label",
      "discord.commands.help.description",
      "discord.components.linkButton",
      "discord.messages.linkConflict",
    ];

    for (const key of requiredKeys) {
      expect(hasTranslationKey(key)).toBe(true);
      expect(translations.en[key]).toEqual(expect.any(String));
      expect(translations.ru[key]).toEqual(expect.any(String));
    }
  });

  it("keeps every locale JSON catalog in key parity with the fallback catalog", () => {
    const fallbackKeys = Object.keys(translations[fallbackLocale]).sort(
      (left, right) => left.localeCompare(right),
    );

    for (const locale of supportedLocales) {
      expect(
        Object.keys(translations[locale]).sort((left, right) =>
          left.localeCompare(right),
        ),
        locale,
      ).toEqual(fallbackKeys);
    }
  });

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

  it("falls back to the English catalog when a supported locale misses a key", () => {
    const partialTranslations = translations as Record<
      Locale,
      Partial<LocaleCatalog>
    >;
    const original = partialTranslations.ru["common.ready"];
    delete partialTranslations.ru["common.ready"];

    try {
      expect(translate("common.ready", { locale: "ru" })).toBe("Ready");
    } finally {
      partialTranslations.ru["common.ready"] = original;
    }
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

  it("keeps i18n focused on catalogs, translation lookup, and locale middleware", () => {
    const source = readFileSync(join(__dirname, "i18n.ts"), "utf8");

    expect(source).not.toContain("@app/common/intl");
    expect(source).not.toContain("IntlContext");
    expect(source).not.toContain("randomLocalizedText");
  });

  it("stores resolved locale on requests through middleware", () => {
    const request = { headers: { "accept-language": "ru" } };
    const next = vi.fn();
    createRequestLocaleMiddleware(new I18nService())(request, {}, next);
    expect(request).toMatchObject({ language: "ru", locale: "ru" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
