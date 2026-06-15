import { describe, expect, it } from "vitest";
import { createI18nMiddleware, resolveTelegramLocale } from "./i18n";
import type { TelegramBotContext } from "./types";

describe("Telegram bot i18n", () => {
  it("resolves locale by linked user, session, identity, Telegram language, then fallback", () => {
    expect(
      resolveTelegramLocale({
        linkedUser: { locale: "ru" },
        sessionLocale: "en",
        identityLocale: "en",
        telegramLanguageCode: "en-US",
      }),
    ).toBe("ru");
    expect(
      resolveTelegramLocale({
        sessionLocale: "ru",
        identityLocale: "en",
        telegramLanguageCode: "en-US",
      }),
    ).toBe("ru");
    expect(
      resolveTelegramLocale({
        identityLocale: "ru",
        telegramLanguageCode: "en-US",
      }),
    ).toBe("ru");
    expect(resolveTelegramLocale({ telegramLanguageCode: "ru-RU" })).toBe("ru");
    expect(resolveTelegramLocale({ telegramLanguageCode: "unsupported" })).toBe(
      "en",
    );
  });

  it("exposes ctx.t using the current session locale for public replies", async () => {
    const middleware = createI18nMiddleware();
    const ctx = { session: { locale: "ru" } } as TelegramBotContext;
    let translated = "";

    await middleware(ctx, () => {
      translated = ctx.t("bot.message.welcome");
      ctx.session.locale = "en";
      translated += `|${ctx.t("bot.message.welcome")}`;
      return Promise.resolve();
    });

    expect(translated).toBe(
      "Добро пожаловать! Выберите действие.|Welcome! Choose an action.",
    );
  });
});
