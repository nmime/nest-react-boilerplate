import { describe, expect, it, vi } from "vitest";
import { menuIdForRoute } from "./navigation";
import { routeText } from "./menus";
import { initialTelegramBotSession } from "./session";
import type { TelegramBotContext, TelegramBotRoute } from "./types";

function ctx(route: TelegramBotRoute = "main") {
  const t = vi.fn((key: string) => `t:${key}`);
  return {
    t,
    session: {
      ...initialTelegramBotSession(),
      currentRoute: route,
      auth: { linked: false },
    },
  } as unknown as TelegramBotContext & { t: ReturnType<typeof vi.fn> };
}

describe("Telegram bot menus", () => {
  it("maps every public route to a stable short menu id", () => {
    const routes: Array<[TelegramBotRoute, string]> = [
      ["main", "telegram:menu:main"],
      ["profile", "telegram:menu:profile"],
      ["settings", "telegram:menu:settings"],
      ["settings.language", "telegram:menu:language"],
      ["settings.language.confirm", "telegram:menu:language"],
      ["support", "telegram:menu:support"],
      ["support.contact", "telegram:menu:support"],
      ["link", "telegram:menu:link"],
      ["link.instructions", "telegram:menu:link"],
    ];

    for (const [route, id] of routes) {
      expect(menuIdForRoute(route)).toBe(id);
      expect(id.length).toBeLessThanOrEqual(64);
    }
  });

  it("uses i18n keys for public route text", () => {
    const expectations: Array<[TelegramBotRoute, string]> = [
      ["main", "t:bot.message.welcome"],
      ["settings", "t:bot.route.settings"],
      ["settings.language", "t:bot.message.chooseLanguage"],
      ["settings.language.confirm", "t:bot.message.chooseLanguage"],
      ["support", "t:bot.route.support"],
      ["support.contact", "t:bot.route.support"],
      ["link", "t:bot.route.link"],
      ["link.instructions", "t:bot.route.link"],
    ];

    for (const [route, text] of expectations) {
      const current = ctx(route);
      expect(routeText(current, route)).toBe(text);
      expect(current.t).toHaveBeenCalled();
    }
  });

  it("localizes linked and unlinked profile status through ctx.t", () => {
    const unlinked = ctx("profile");
    expect(routeText(unlinked, "profile")).toContain(
      "t:auth.social.status.notLinked",
    );
    expect(unlinked.t).toHaveBeenCalledWith("auth.social.status.notLinked");

    const linked = ctx("profile");
    linked.session.auth.linked = true;
    expect(routeText(linked, "profile")).toContain(
      "t:auth.social.status.linked",
    );
    expect(linked.t).toHaveBeenCalledWith("auth.social.status.linked");
  });
});
