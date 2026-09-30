import { Menu } from '@grammyjs/menu';
import { supportedLocales } from '@app/backend-common-i18n';
import type { Locale } from '../i18n';
import { resolveTelegramApplication, type TelegramBotApplicationPort } from './application';
import { goBack, menuIdForRoute, navigateTo, replaceCurrentRoute } from '../navigation';
import type { TelegramBotAuthPort, TelegramBotContext, TelegramBotMenus, TelegramBotRoute } from '../type';
import { languageLabel, menuFingerprint } from '../util';

export function createTelegramMenus(input: {
  application?: TelegramBotApplicationPort;
  auth?: TelegramBotAuthPort;
  appUrl?: string;
}): TelegramBotMenus {
  const application = input.application ?? resolveTelegramApplication({ auth: input.auth });
  const main = new Menu<TelegramBotContext>('telegram:menu:main', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  });

  if (input.appUrl) {
    main.webApp((ctx) => ctx.t('bot.menu.openApp'), input.appUrl).row();
  }

  main
    .submenu(
      (ctx) => ctx.t('bot.menu.profile'),
      'telegram:menu:profile',
      (ctx) => setRoute(ctx, 'profile'),
    )
    .submenu(
      (ctx) => ctx.t('bot.menu.language'),
      'telegram:menu:language',
      (ctx) => setRoute(ctx, 'settings.language'),
    )
    .row()
    .submenu(
      (ctx) => ctx.t('bot.menu.support'),
      'telegram:menu:support',
      (ctx) => setRoute(ctx, 'support'),
    );

  const profile = new Menu<TelegramBotContext>('telegram:menu:profile', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .submenu(
      (ctx) => ctx.t('bot.menu.link'),
      'telegram:menu:link',
      (ctx) => setRoute(ctx, 'link'),
    )
    .row()
    .text(
      (ctx) => ctx.t('bot.menu.back'),
      async (ctx) => navigateBack(ctx),
    );

  const settings = new Menu<TelegramBotContext>('telegram:menu:settings', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .submenu(
      (ctx) => ctx.t('bot.menu.language'),
      'telegram:menu:language',
      (ctx) => setRoute(ctx, 'settings.language'),
    )
    .row()
    .text(
      (ctx) => ctx.t('bot.menu.back'),
      async (ctx) => navigateBack(ctx),
    );

  const language = new Menu<TelegramBotContext>('telegram:menu:language', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  });

  for (const locale of supportedLocales) {
    language.text(
      (ctx) => languageLabel(ctx, locale),
      async (ctx) => updateLanguage(ctx, locale, application),
    );
  }
  language.row().text(
    (ctx) => ctx.t('bot.menu.back'),
    async (ctx) => navigateBack(ctx),
  );

  const support = new Menu<TelegramBotContext>('telegram:menu:support', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .text(
      (ctx) => ctx.t('bot.menu.contactSupport'),
      async (ctx) => {
        navigateTo(ctx, 'support.contact');
        await renderRoute(ctx, 'support.contact');
        ctx.menu.update();
      },
    )
    .row()
    .text(
      (ctx) => ctx.t('bot.menu.back'),
      async (ctx) => navigateBack(ctx),
    );

  const linkMenu = new Menu<TelegramBotContext>('telegram:menu:link', {
    fingerprint: (ctx) => menuFingerprint(ctx),
  })
    .text(
      (ctx) => ctx.t('bot.menu.link'),
      async (ctx) => {
        navigateTo(ctx, 'link.instructions');
        let instructions: string | null = null;
        /* v8 ignore next -- valid Telegram callback queries include sender identity. */
        if (ctx.identity) {
          instructions = await application.createLinkInstructions(ctx.identity);
        }
        await renderText(ctx, instructions ?? ctx.t('bot.route.link'));
        ctx.menu.update();
      },
    )
    .row()
    .text(
      (ctx) => ctx.t('bot.menu.back'),
      async (ctx) => navigateBack(ctx),
    );

  main.register(profile);
  main.register(settings);
  main.register(language, 'telegram:menu:settings');
  main.register(support);
  main.register(linkMenu);

  return { main, profile, settings, language, support, link: linkMenu };
}

export async function replyWithCurrentRoute(ctx: TelegramBotContext): Promise<void> {
  await replyForRoute(ctx, ctx.session.currentRoute);
}

export async function replyForRoute(ctx: TelegramBotContext, route: TelegramBotRoute): Promise<void> {
  const text = routeText(ctx, route);
  const menu = ctx.session.lastMenuId ?? 'telegram:menu:main';
  await ctx.reply(text);
  ctx.session.lastMenuId = menu;
}

export function routeText(ctx: TelegramBotContext, route: TelegramBotRoute): string {
  if (route === 'settings.language' || route === 'settings.language.confirm') {
    return ctx.t('bot.message.chooseLanguage');
  }

  if (route === 'link' || route === 'link.instructions') {
    return ctx.t('bot.route.link');
  }

  if (route === 'profile') {
    return ctx.session.auth.linked ? ctx.t('bot.message.profileLinked') : ctx.t('bot.message.profileNotLinked');
  }

  if (route.startsWith('support')) {
    return ctx.t('bot.route.support');
  }

  if (route === 'settings') {
    return ctx.t('bot.route.settings');
  }

  return ctx.t('bot.message.welcome');
}

async function setRoute(ctx: TelegramBotContext, route: TelegramBotRoute): Promise<void> {
  navigateTo(ctx, route);
  await renderRoute(ctx, route);
}

async function navigateBack(ctx: TelegramBotContext): Promise<void> {
  const route = goBack(ctx);
  await renderRoute(ctx, route);
  ctx.menu.nav(menuIdForRoute(route));
}

async function updateLanguage(
  ctx: TelegramBotContext,
  locale: Locale,
  application: TelegramBotApplicationPort,
): Promise<void> {
  ctx.session.locale = locale;
  ctx.session.identityLocale = locale;
  replaceCurrentRoute(ctx, 'settings.language.confirm', { locale });
  /* v8 ignore next -- valid Telegram callback queries include sender identity. */
  if (ctx.identity) {
    await application.updateLinkedUserLocale({
      identity: ctx.identity,
      locale,
      userId: ctx.session.auth.userId,
      tenantId: ctx.session.auth.tenantId,
    });
  }
  await renderRoute(ctx, 'settings.language.confirm');
  ctx.menu.update();
}

async function renderRoute(ctx: TelegramBotContext, route: TelegramBotRoute): Promise<void> {
  await renderText(ctx, routeText(ctx, route));
}

async function renderText(ctx: TelegramBotContext, text: string): Promise<void> {
  /* v8 ignore next -- menu callbacks are only valid for Telegram callback messages. */
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text);
      return;
    } catch {
      /* v8 ignore next 4 -- defensive swallow for expired callback queries after edit failure. */
      await ctx.answerCallbackQuery({ text: ctx.t('bot.error.unknown') }).catch(() => undefined);
      return;
    }
  }

  /* v8 ignore next -- menu callbacks are only valid for Telegram callback messages. */
  await ctx.reply(text);
}
