import { Bot, Composer, InlineKeyboard, MemorySessionStorage } from 'grammy';
import type { BotCommand, LanguageCode } from 'grammy/types';
import { sequentialize } from '@grammyjs/runner';
import { conversations, createConversation } from '@grammyjs/conversations';
import { hydrate, hydrateApi } from '@grammyjs/hydrate';
import { limit } from '@grammyjs/ratelimiter';
import { Router } from '@grammyjs/router';
import { autoRetry } from '@grammyjs/auto-retry';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { defaultLocale, supportedLocales, translate, type Locale, type TranslationKey } from '../i18n';
import { createTelegramApplication, resolveTelegramApplication, type TelegramBotApplicationPort } from './application';
import { isSafeTelegramAppUrl, resolveTelegramBotConfig } from './config';
import { resolveTelegramIdentity } from '../identity';
import { createI18nMiddleware, resolveTelegramLocale } from '../i18n';
import { createTelegramMenus, routeText } from './menus';
import { goHome, navigateTo } from '../navigation';
import { createSessionMiddleware } from './session';
import type {
  TelegramBotConfig,
  TelegramBotContext,
  TelegramBotDependencies,
  TelegramBotInstance,
  TelegramBotSession,
  TelegramLinkPayload,
} from '../type';
import { writeStderrLine } from '../util';

const telegramCommandDefinitions: readonly {
  command: string;
  descriptionKey: TranslationKey;
  requiresApp?: boolean;
}[] = [
  { command: 'start', descriptionKey: 'bot.command.start' },
  { command: 'app', descriptionKey: 'bot.command.app', requiresApp: true },
  { command: 'profile', descriptionKey: 'bot.command.profile' },
  { command: 'language', descriptionKey: 'bot.command.language' },
  { command: 'support', descriptionKey: 'bot.command.support' },
  { command: 'link', descriptionKey: 'bot.command.link' },
];

const telegramBotUiLocales: ReadonlyArray<{ locale: Locale; languageCode?: LanguageCode }> = [
  { locale: defaultLocale },
  ...supportedLocales.map((locale) => ({ locale, languageCode: locale })),
];

export function createTelegramBot(
  config: TelegramBotConfig = resolveTelegramBotConfig(),
  dependencies: TelegramBotDependencies = {},
): TelegramBotInstance {
  const safeAppUrl = config.appUrl && isSafeTelegramAppUrl(config.appUrl) ? config.appUrl : undefined;
  const bot = new Bot<TelegramBotContext>(config.token, {
    botInfo: config.botInfo,
    client: {
      ...(config.apiRoot ? { apiRoot: config.apiRoot } : {}),
      ...(dependencies.fetch ? { fetch: dependencies.fetch as never } : {}),
    },
  });

  if (dependencies.api) {
    Object.defineProperty(bot, 'api', { value: dependencies.api });
  }

  bot.api.config.use(autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 2 }), apiThrottler(), hydrateApi());

  /* v8 ignore next 5 -- grammy invokes this only after middleware failure; tests cover normal update paths. */
  bot.catch((error) => {
    if (config.environment === 'test') {
      throw error.error;
    }
    writeStderrLine(`Telegram bot update failed ${String(error.error)}`);
  });

  const storage =
    dependencies.sessionStorage ?? new MemorySessionStorage<TelegramBotSession>(config.sessionTtlSeconds * 1000);
  // Serialize updates per user before touching the session so concurrent
  // updates (webhook + sink concurrency in the worker) cannot interleave
  // session reads and writes and drop each other's changes.
  bot.use(sequentialize((ctx) => ctx.from?.id.toString()));
  bot.use(createSessionMiddleware(storage));
  bot.use(hydrate());
  bot.use(createI18nMiddleware());
  bot.use(
    limit<TelegramBotContext, NonNullable<TelegramBotDependencies['rateLimitStorage']>>({
      timeFrame: config.rateLimit.timeFrameMs,
      limit: config.rateLimit.limit,
      storageClient: dependencies.rateLimitStorage ?? 'MEMORY_STORE',
      keyPrefix: 'telegram-bot-rate-limit:',
      keyGenerator: (ctx) => ctx.from?.id.toString(),
      // The limiter awaits this handler's return value, so awaiting the reply
      // notifies the user before the update is considered handled. The library
      // types the callback as `=> void`, hence the targeted disable.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- limiter awaits the returned promise
      onLimitExceeded: async (ctx) => {
        ctx.session.rateLimitedUntil = Date.now() + config.rateLimit.timeFrameMs;
        await ctx
          .reply(ctx.t('bot.error.rateLimited'))
          /* v8 ignore next -- defensive logging when Telegram rejects the rate-limit notice itself. */
          .catch((error: unknown) => {
            /* v8 ignore next 3 -- defensive logging when Telegram rejects the rate-limit notice itself. */
            writeStderrLine(`Telegram bot rate-limit reply failed ${String(error)}`);
          });
      },
      alwaysReply: true,
    }),
  );
  const application = createTelegramApplication(dependencies);
  bot.use(createIdentityAndLocaleMiddleware(application));

  const menus = createTelegramMenus({
    application,
    appUrl: safeAppUrl,
  });
  const renderMainMenu = () => menus.main;
  bot.use(menus.main);
  bot.use(conversations());
  bot.use(createConversation(linkConversation));

  bot.command('start', async (ctx) => handleStart(ctx, application, renderMainMenu));
  bot.command('app', async (ctx) => {
    if (!safeAppUrl) {
      await ctx.reply(ctx.t('bot.error.unavailable'), { reply_markup: menus.main });
      return;
    }
    await ctx.reply(ctx.t('bot.menu.openApp'), {
      reply_markup: new InlineKeyboard().webApp(ctx.t('bot.menu.openApp'), safeAppUrl),
    });
  });
  bot.command('profile', async (ctx) => renderCommandRoute(ctx, 'profile', menus.profile));
  bot.command('support', async (ctx) => renderCommandRoute(ctx, 'support', menus.support));
  bot.command('link', async (ctx) => handleLink(ctx, application, menus.link));
  bot.command('language', async (ctx) => {
    navigateTo(ctx, 'settings.language');
    await ctx.reply(ctx.t('bot.message.chooseLanguage'), {
      reply_markup: menus.language,
    });
  });

  const router = new Router<TelegramBotContext>((ctx) => ctx.session.currentRoute);
  router.route('profile', new Composer<TelegramBotContext>().middleware());
  router.otherwise(async (ctx, next) => {
    if (ctx.callbackQuery) {
      await next();
      return;
    }
    await ctx.reply(ctx.t('bot.message.welcome'), { reply_markup: menus.main });
  });
  bot.use(router);
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: ctx.t('bot.error.unknown') });
  });

  if (config.setupMenuButton) {
    void setupTelegramBotUi(bot.api, safeAppUrl);
  }

  return { bot, menus: { main: menus.main }, config };
}

export function telegramBotCommands(locale: Locale, includeApp: boolean): BotCommand[] {
  return telegramCommandDefinitions
    .filter((definition) => includeApp || !definition.requiresApp)
    .map(({ command, descriptionKey }) => ({
      command,
      description: translate(descriptionKey, { locale }),
    }));
}

export async function setupTelegramBotUi(
  api: Pick<
    NonNullable<TelegramBotDependencies['api']>,
    'deleteMyCommands' | 'setChatMenuButton' | 'setMyCommands' | 'setMyDescription' | 'setMyShortDescription'
  >,
  appUrl?: string,
): Promise<void> {
  await Promise.all([
    ...telegramBotUiLocales.map(({ locale, languageCode }) =>
      setupTelegramCommandMenu(api, locale, Boolean(appUrl), languageCode),
    ),
    ...telegramBotUiLocales.map(({ locale, languageCode }) => setupTelegramBotProfile(api, locale, languageCode)),
    appUrl ? setupTelegramMenuButton(api, appUrl) : Promise.resolve(),
  ]);
}

async function setupTelegramCommandMenu(
  api: Pick<NonNullable<TelegramBotDependencies['api']>, 'deleteMyCommands' | 'setMyCommands'>,
  locale: Locale,
  includeApp: boolean,
  languageCode?: LanguageCode,
): Promise<void> {
  const languageOptions = languageCode ? { language_code: languageCode } : {};
  try {
    await Promise.all([
      api.deleteMyCommands({ scope: { type: 'default' }, ...languageOptions }),
      api.deleteMyCommands({ scope: { type: 'all_group_chats' }, ...languageOptions }),
    ]);
  } catch (error) {
    writeStderrLine(`Telegram bot public command cleanup failed (${languageCode ?? 'default'}) ${String(error)}`);
  }

  try {
    await api.setMyCommands(telegramBotCommands(locale, includeApp), {
      scope: { type: 'all_private_chats' },
      ...languageOptions,
    });
  } catch (error) {
    writeStderrLine(`Telegram bot command menu setup failed (${languageCode ?? 'default'}) ${String(error)}`);
  }
}

async function setupTelegramBotProfile(
  api: Pick<NonNullable<TelegramBotDependencies['api']>, 'setMyDescription' | 'setMyShortDescription'>,
  locale: Locale,
  languageCode?: LanguageCode,
): Promise<void> {
  const options = languageCode ? { language_code: languageCode } : undefined;
  try {
    await Promise.all([
      api.setMyDescription(translate('bot.profile.description', { locale }), options),
      api.setMyShortDescription(translate('bot.profile.shortDescription', { locale }), options),
    ]);
  } catch (error) {
    writeStderrLine(`Telegram bot profile setup failed (${languageCode ?? 'default'}) ${String(error)}`);
  }
}

export async function setupTelegramMenuButton(
  api: Pick<NonNullable<TelegramBotDependencies['api']>, 'setChatMenuButton'>,
  appUrl: string,
): Promise<void> {
  try {
    await api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: translate('bot.menu.openApp'),
        web_app: { url: appUrl },
      },
    });
  } catch (error) {
    writeStderrLine(`Telegram bot menu button setup failed ${String(error)}`);
  }
}

export async function handleStart(
  ctx: TelegramBotContext,
  applicationOrDependencies: TelegramBotApplicationPort | TelegramBotDependencies = {},
  renderMainMenu: () => ReturnType<typeof createTelegramMenus>['main'] = () =>
    createTelegramMenus({
      application: resolveTelegramApplication(applicationOrDependencies),
    }).main,
): Promise<void> {
  const application = resolveTelegramApplication(applicationOrDependencies);
  goHome(ctx);
  const payload = ctx.match?.toString().trim();
  if (payload) {
    const handled = await handleStartPayload(ctx, payload, application);
    if (!handled) {
      await ctx.reply(ctx.t('bot.error.expired'));
    }
  }

  await ctx.reply(ctx.t('bot.message.welcome'), {
    reply_markup: renderMainMenu(),
  });
}

export async function handleLink(
  ctx: TelegramBotContext,
  applicationOrDependencies: TelegramBotApplicationPort | TelegramBotDependencies = {},
  replyMarkup?: ReturnType<typeof createTelegramMenus>['link'],
): Promise<void> {
  const application = resolveTelegramApplication(applicationOrDependencies);
  navigateTo(ctx, 'link');
  const instructions = ctx.identity ? await application.createLinkInstructions(ctx.identity) : null;
  await ctx.reply(instructions ?? ctx.t('bot.route.link'), replyMarkup ? { reply_markup: replyMarkup } : undefined);
}

async function renderCommandRoute(
  ctx: TelegramBotContext,
  route: 'profile' | 'settings' | 'support',
  replyMarkup: ReturnType<typeof createTelegramMenus>['profile' | 'settings' | 'support'],
): Promise<void> {
  navigateTo(ctx, route);
  await ctx.reply(routeText(ctx, route), { reply_markup: replyMarkup });
}

async function handleStartPayload(
  ctx: TelegramBotContext,
  payload: string,
  application: TelegramBotApplicationPort,
): Promise<boolean> {
  if (!ctx.identity) {
    return false;
  }

  const resolved = await application.consumeStartPayload(payload, ctx.identity);
  if (!resolved) {
    return false;
  }

  applyPayload(ctx, resolved);
  if (resolved.kind === 'link') {
    ctx.session.auth.linked = true;
    await ctx.reply(ctx.t('bot.message.linked'));
  }

  return true;
}

function applyPayload(ctx: TelegramBotContext, payload: TelegramLinkPayload): void {
  if (payload.locale) {
    ctx.session.locale = payload.locale;
  }

  if (payload.kind === 'route' && payload.route) {
    navigateTo(ctx, payload.route, payload.params);
    return;
  }

  navigateTo(ctx, 'link');
}

function createIdentityAndLocaleMiddleware(application: TelegramBotApplicationPort) {
  return async (ctx: TelegramBotContext, next: () => Promise<void>) => {
    const identity = resolveTelegramIdentity(ctx);
    ctx.identity = identity;
    /* v8 ignore next -- grammy session updates without a Telegram sender cannot safely reach this middleware. */
    const linkedUser = identity ? await application.findLinkedUser(identity) : null;
    // findLinkedUser is the source of truth on every update: a null result means
    // the identity is no longer linked, so link-state must be cleared rather than
    // kept sticky-true. (Infrastructure failures throw and propagate, so they are
    // never observed here as a spurious null.) Only overwrite when we actually
    // performed a lookup for a present identity.
    if (identity) {
      ctx.session.auth = {
        linked: Boolean(linkedUser),
        userId: linkedUser?.userId,
        tenantId: linkedUser?.tenantId ?? undefined,
        linkedLocale: linkedUser?.locale ?? undefined,
      };
    }
    /* v8 ignore next -- same invalid sender-less update guard as linked-user lookup. */
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

/* v8 ignore next 9 -- registered conversation entrypoint; /link command covers the public reply path. */
async function linkConversation(
  _conversation: import('@grammyjs/conversations').Conversation<TelegramBotContext, TelegramBotContext>,
  ctx: TelegramBotContext,
) {
  await ctx.reply(ctx.t('bot.route.link'));
}
