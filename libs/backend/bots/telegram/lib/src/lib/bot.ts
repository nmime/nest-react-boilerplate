import { Bot, Composer, MemorySessionStorage } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { hydrate, hydrateApi } from "@grammyjs/hydrate";
import { limit } from "@grammyjs/ratelimiter";
import { Router } from "@grammyjs/router";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { resolveLocale } from "@app/common/i18n";
import { isSafeTelegramAppUrl, resolveTelegramBotConfig } from "./config";
import { resolveTelegramIdentity } from "./identity";
import { createI18nMiddleware, resolveTelegramLocale } from "./i18n";
import { createTelegramMenus } from "./menus";
import { goHome, navigateTo } from "./navigation";
import { createSessionMiddleware } from "./session";
import type {
  TelegramBotConfig,
  TelegramBotContext,
  TelegramBotDependencies,
  TelegramBotInstance,
  TelegramBotSession,
  TelegramLinkPayload,
} from "./types";

export function createTelegramBot(
  config: TelegramBotConfig = resolveTelegramBotConfig(),
  dependencies: TelegramBotDependencies = {},
): TelegramBotInstance {
  const bot = new Bot<TelegramBotContext>(config.token, {
    botInfo: config.botInfo,
    client: dependencies.fetch
      ? { fetch: dependencies.fetch as never }
      : undefined,
  });

  if (dependencies.api) {
    Object.defineProperty(bot, "api", { value: dependencies.api });
  }

  bot.api.config.use(
    autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 2 }),
    apiThrottler(),
    hydrateApi(),
  );

  bot.catch((error) => {
    if (config.environment === "test") {
      throw error.error;
    }
    console.error("Telegram bot update failed", error.error);
  });

  const storage =
    dependencies.sessionStorage ??
    new MemorySessionStorage<TelegramBotSession>(
      config.sessionTtlSeconds * 1000,
    );
  bot.use(createSessionMiddleware(storage));
  bot.use(hydrate());
  bot.use(createI18nMiddleware());
  bot.use(
    limit<
      TelegramBotContext,
      NonNullable<TelegramBotDependencies["rateLimitStorage"]>
    >({
      timeFrame: config.rateLimit.timeFrameMs,
      limit: config.rateLimit.limit,
      storageClient: dependencies.rateLimitStorage ?? "MEMORY_STORE",
      keyPrefix: "telegram-bot-rate-limit:",
      keyGenerator: (ctx) => ctx.from?.id.toString(),
      onLimitExceeded: (ctx) => {
        ctx.session.rateLimitedUntil =
          Date.now() + config.rateLimit.timeFrameMs;
        return ctx.reply(ctx.t("bot.error.rateLimited")) as unknown as void;
      },
      alwaysReply: true,
    }),
  );
  bot.use(createIdentityAndLocaleMiddleware(dependencies));

  const menus = createTelegramMenus({
    auth: dependencies.auth,
    appUrl:
      config.appUrl && isSafeTelegramAppUrl(config.appUrl)
        ? config.appUrl
        : undefined,
  });
  const renderMainMenu = () => menus.main;
  bot.use(menus.main);
  bot.use(conversations());
  bot.use(createConversation(linkConversation));

  bot.command("start", async (ctx) =>
    handleStart(ctx, dependencies, renderMainMenu),
  );
  bot.command("link", async (ctx) => handleLink(ctx, dependencies));
  bot.command("language", async (ctx) => {
    navigateTo(ctx, "settings.language");
    await ctx.reply(ctx.t("bot.message.chooseLanguage"), {
      reply_markup: menus.language,
    });
  });

  const router = new Router<TelegramBotContext>(
    (ctx) => ctx.session.currentRoute,
  );
  router.route("profile", new Composer<TelegramBotContext>().middleware());
  router.otherwise(async (ctx, next) => {
    if (ctx.callbackQuery) {
      await next();
      return;
    }
    await ctx.reply(ctx.t("bot.message.welcome"), { reply_markup: menus.main });
  });
  bot.use(router);
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({ text: ctx.t("bot.error.unknown") });
  });

  return { bot, menus: { main: menus.main }, config };
}

export async function handleStart(
  ctx: TelegramBotContext,
  dependencies: TelegramBotDependencies = {},
  renderMainMenu: () => ReturnType<typeof createTelegramMenus>["main"] = () =>
    createTelegramMenus({ auth: dependencies.auth }).main,
): Promise<void> {
  goHome(ctx);
  const payload = ctx.match?.toString().trim();
  if (payload) {
    const handled = await handleStartPayload(ctx, payload, dependencies);
    if (!handled) {
      await ctx.reply(ctx.t("bot.error.expired"));
    }
  }

  await ctx.reply(ctx.t("bot.message.welcome"), {
    reply_markup: renderMainMenu(),
  });
}

export async function handleLink(
  ctx: TelegramBotContext,
  dependencies: TelegramBotDependencies = {},
): Promise<void> {
  navigateTo(ctx, "link");
  const instructions =
    ctx.identity && dependencies.auth
      ? await dependencies.auth.createLinkInstructions(ctx.identity)
      : null;
  await ctx.reply(instructions ?? ctx.t("bot.route.link"));
}

async function handleStartPayload(
  ctx: TelegramBotContext,
  payload: string,
  dependencies: TelegramBotDependencies,
): Promise<boolean> {
  if (!ctx.identity || !dependencies.auth) {
    return false;
  }

  const resolved = await dependencies.auth.consumeLinkPayload(
    payload,
    ctx.identity,
  );
  if (!resolved) {
    return false;
  }

  applyPayload(ctx, resolved);
  if (resolved.kind === "link") {
    ctx.session.auth.linked = true;
    await ctx.reply(ctx.t("bot.message.linked"));
  }

  return true;
}

function applyPayload(
  ctx: TelegramBotContext,
  payload: TelegramLinkPayload,
): void {
  if (payload.locale) {
    ctx.session.locale = payload.locale;
  }

  if (payload.kind === "route" && payload.route) {
    navigateTo(ctx, payload.route, payload.params);
    return;
  }

  navigateTo(ctx, "link");
}

function createIdentityAndLocaleMiddleware(
  dependencies: TelegramBotDependencies,
) {
  return async (ctx: TelegramBotContext, next: () => Promise<void>) => {
    const identity = resolveTelegramIdentity(ctx);
    ctx.identity = identity;
    const linkedUser = identity
      ? await dependencies.auth?.findLinkedUser(identity)
      : null;
    ctx.session.auth = {
      linked: Boolean(linkedUser) || ctx.session.auth.linked,
      userId: linkedUser?.userId ?? ctx.session.auth.userId,
      tenantId: linkedUser?.tenantId ?? ctx.session.auth.tenantId,
      linkedLocale: linkedUser?.locale ?? ctx.session.auth.linkedLocale,
    };
    ctx.session.identityLocale = identity?.locale ?? undefined;
    ctx.session.locale = resolveTelegramLocale({
      linkedUser,
      sessionLocale: ctx.session.locale,
      identityLocale: ctx.session.identityLocale,
      telegramLanguageCode: ctx.from?.language_code,
    });
    ctx.route = ctx.session.currentRoute;
    await next();
  };
}

async function linkConversation(
  _conversation: import("@grammyjs/conversations").Conversation<
    TelegramBotContext,
    TelegramBotContext
  >,
  ctx: TelegramBotContext,
) {
  await ctx.reply(ctx.t("bot.route.link"));
}

export function resolveStartRoute(payload: string | undefined): string | null {
  if (!payload) {
    return null;
  }

  return resolveLocale(payload)
    ? `route:settings.language:${payload}`
    : payload;
}
