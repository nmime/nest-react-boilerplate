import { Menu } from "@grammyjs/menu";
import { FormattedString, fmt } from "@grammyjs/parse-mode";
import type { Locale } from "@app/common/i18n";
import { goBack, goHome, navigateTo } from "./navigation";
import type {
  TelegramBotAuthPort,
  TelegramBotContext,
  TelegramBotRoute,
} from "./types";

export interface TelegramBotMenus {
  main: Menu<TelegramBotContext>;
  profile: Menu<TelegramBotContext>;
  settings: Menu<TelegramBotContext>;
  language: Menu<TelegramBotContext>;
  support: Menu<TelegramBotContext>;
  link: Menu<TelegramBotContext>;
}

export function createTelegramMenus(input: {
  auth?: TelegramBotAuthPort;
  appUrl?: string;
}): TelegramBotMenus {
  const main = new Menu<TelegramBotContext>("telegram:menu:main", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .submenu(
      (ctx) => ctx.t("bot.menu.profile"),
      "telegram:menu:profile",
      (ctx) => setRoute(ctx, "profile"),
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.settings"),
      "telegram:menu:settings",
      (ctx) => setRoute(ctx, "settings"),
    )
    .row()
    .submenu(
      (ctx) => ctx.t("bot.menu.support"),
      "telegram:menu:support",
      (ctx) => setRoute(ctx, "support"),
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.link"),
      "telegram:menu:link",
      (ctx) => setRoute(ctx, "link"),
    );

  if (input.appUrl) {
    main.row().url((ctx) => ctx.t("bot.menu.openApp"), input.appUrl);
  }

  const profile = new Menu<TelegramBotContext>("telegram:menu:profile", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .submenu(
      (ctx) => ctx.t("bot.menu.settings"),
      "telegram:menu:settings",
      (ctx) => setRoute(ctx, "settings"),
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.link"),
      "telegram:menu:link",
      (ctx) => setRoute(ctx, "link"),
    )
    .row()
    .text(
      (ctx) => ctx.t("bot.menu.back"),
      async (ctx) => navigateBack(ctx),
    )
    .text(
      (ctx) => ctx.t("bot.menu.home"),
      async (ctx) => navigateHome(ctx),
    );

  const settings = new Menu<TelegramBotContext>("telegram:menu:settings", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .submenu(
      (ctx) => ctx.t("bot.menu.language"),
      "telegram:menu:language",
      (ctx) => setRoute(ctx, "settings.language"),
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.support"),
      "telegram:menu:support",
      (ctx) => setRoute(ctx, "support"),
    )
    .row()
    .text(
      (ctx) => ctx.t("bot.menu.back"),
      async (ctx) => navigateBack(ctx),
    )
    .text(
      (ctx) => ctx.t("bot.menu.home"),
      async (ctx) => navigateHome(ctx),
    );

  const language = new Menu<TelegramBotContext>("telegram:menu:language", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .text(
      (ctx) => languageLabel(ctx, "en"),
      async (ctx) => updateLanguage(ctx, "en", input.auth),
    )
    .text(
      (ctx) => languageLabel(ctx, "ru"),
      async (ctx) => updateLanguage(ctx, "ru", input.auth),
    )
    .row()
    .text(
      (ctx) => ctx.t("bot.menu.back"),
      async (ctx) => navigateBack(ctx),
    )
    .text(
      (ctx) => ctx.t("bot.menu.home"),
      async (ctx) => navigateHome(ctx),
    );

  const support = new Menu<TelegramBotContext>("telegram:menu:support", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .text(
      (ctx) => ctx.t("bot.route.support"),
      async (ctx) => {
        navigateTo(ctx, "support.contact");
        await renderRoute(ctx, "support.contact");
        ctx.menu.update();
      },
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.settings"),
      "telegram:menu:settings",
      (ctx) => setRoute(ctx, "settings"),
    )
    .row()
    .text(
      (ctx) => ctx.t("bot.menu.back"),
      async (ctx) => navigateBack(ctx),
    )
    .text(
      (ctx) => ctx.t("bot.menu.home"),
      async (ctx) => navigateHome(ctx),
    );

  const linkMenu = new Menu<TelegramBotContext>("telegram:menu:link", {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .text(
      (ctx) => ctx.t("auth.social.button.linkTelegram"),
      async (ctx) => {
        navigateTo(ctx, "link.instructions");
        const instructions =
          ctx.identity && input.auth
            ? await input.auth.createLinkInstructions(ctx.identity)
            : null;
        await renderText(ctx, instructions ?? ctx.t("bot.route.link"));
        ctx.menu.update();
      },
    )
    .submenu(
      (ctx) => ctx.t("bot.menu.language"),
      "telegram:menu:language",
      (ctx) => setRoute(ctx, "settings.language"),
    )
    .row()
    .text(
      (ctx) => ctx.t("bot.menu.back"),
      async (ctx) => navigateBack(ctx),
    )
    .text(
      (ctx) => ctx.t("bot.menu.home"),
      async (ctx) => navigateHome(ctx),
    );

  main.register(profile);
  main.register(settings);
  main.register(language, "telegram:menu:settings");
  main.register(support);
  main.register(linkMenu);

  return { main, profile, settings, language, support, link: linkMenu };
}

export async function replyWithCurrentRoute(
  ctx: TelegramBotContext,
): Promise<void> {
  await replyForRoute(ctx, ctx.session.currentRoute);
}

export async function replyForRoute(
  ctx: TelegramBotContext,
  route: TelegramBotRoute,
): Promise<void> {
  const text = routeText(ctx, route);
  const menu = ctx.session.lastMenuId ?? "telegram:menu:main";
  await ctx.reply(text);
  ctx.session.lastMenuId = menu;
}

export function routeText(
  ctx: TelegramBotContext,
  route: TelegramBotRoute,
): string {
  if (route === "settings.language" || route === "settings.language.confirm") {
    return ctx.t("bot.message.chooseLanguage");
  }

  if (route === "link" || route === "link.instructions") {
    return ctx.t("bot.route.link");
  }

  if (route === "profile") {
    const label = ctx.session.auth.linked
      ? ctx.t("auth.social.status.linked")
      : ctx.t("auth.social.status.notLinked");
    return fmt`${FormattedString.link("Telegram", "https://telegram.org")} ${label}`
      .text;
  }

  if (route.startsWith("support")) {
    return ctx.t("bot.route.support");
  }

  if (route === "settings") {
    return ctx.t("bot.route.settings");
  }

  return ctx.t("bot.message.welcome");
}

async function setRoute(
  ctx: TelegramBotContext,
  route: TelegramBotRoute,
): Promise<void> {
  navigateTo(ctx, route);
  await renderRoute(ctx, route);
}

async function navigateBack(ctx: TelegramBotContext): Promise<void> {
  const route = goBack(ctx);
  await renderRoute(ctx, route);
  ctx.menu.back();
}

async function navigateHome(ctx: TelegramBotContext): Promise<void> {
  goHome(ctx);
  await renderRoute(ctx, "main");
  ctx.menu.nav("telegram:menu:main");
}

async function updateLanguage(
  ctx: TelegramBotContext,
  locale: Locale,
  auth: TelegramBotAuthPort | undefined,
): Promise<void> {
  ctx.session.locale = locale;
  ctx.session.identityLocale = locale;
  navigateTo(ctx, "settings.language.confirm", { locale });
  if (ctx.identity && auth) {
    await auth.updateLinkedUserLocale({
      identity: ctx.identity,
      locale,
      userId: ctx.session.auth.userId,
      tenantId: ctx.session.auth.tenantId,
    });
  }
  await renderRoute(ctx, "settings.language.confirm");
  ctx.menu.update();
}

async function renderRoute(
  ctx: TelegramBotContext,
  route: TelegramBotRoute,
): Promise<void> {
  await renderText(ctx, routeText(ctx, route));
}

async function renderText(
  ctx: TelegramBotContext,
  text: string,
): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text);
      return;
    } catch {
      await ctx
        .answerCallbackQuery({ text: ctx.t("bot.error.unknown") })
        .catch(() => undefined);
      return;
    }
  }

  await ctx.reply(text);
}

function languageLabel(ctx: TelegramBotContext, locale: Locale): string {
  const selected = ctx.session.locale === locale ? "✓ " : "";
  return `${selected}${ctx.t(locale === "en" ? "common.language.en" : "common.language.ru")}`;
}

function menuFingerprint(ctx: TelegramBotContext): string {
  return [
    ctx.session.locale,
    ctx.session.currentRoute,
    ctx.session.stack.join("/"),
    ctx.session.auth.linked ? "linked" : "public",
  ].join(":");
}
