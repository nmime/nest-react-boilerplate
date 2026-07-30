// @requirements REQ-SOCIAL-COMMANDS-003
// Evidence for: REQ-SOCIAL-COMMANDS-003
import { describe, expect, it, vi } from 'vitest';
import { goBack, menuIdForRoute } from '../navigation';
import { createTelegramMenus, replyForRoute, replyWithCurrentRoute, routeText } from './menus';
import { initialTelegramBotSession } from './session';
import type { TelegramBotContext, TelegramBotRoute } from '../type';

function ctx(route: TelegramBotRoute = 'main') {
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

describe('Telegram bot menus', () => {
  it('can resolve the application boundary from an auth adapter', () => {
    const menus = createTelegramMenus({
      auth: {
        consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
        createLinkInstructions: vi.fn(() => Promise.resolve(null)),
        findLinkedUser: vi.fn(() => Promise.resolve(null)),
        updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
      },
    });

    expect(menus.main).toBeDefined();
    expect(menus.link).toBeDefined();
  });

  it('maps every public route to a stable short menu id', () => {
    const routes: Array<[TelegramBotRoute, string]> = [
      ['main', 'telegram:menu:main'],
      ['profile', 'telegram:menu:profile'],
      ['settings', 'telegram:menu:settings'],
      ['settings.language', 'telegram:menu:language'],
      ['settings.language.confirm', 'telegram:menu:language'],
      ['support', 'telegram:menu:support'],
      ['support.contact', 'telegram:menu:support'],
      ['link', 'telegram:menu:link'],
      ['link.instructions', 'telegram:menu:link'],
    ];

    for (const [route, id] of routes) {
      expect(menuIdForRoute(route)).toBe(id);
      expect(id.length).toBeLessThanOrEqual(64);
    }
  });

  it('uses i18n keys for public route text', () => {
    const expectations: Array<[TelegramBotRoute, string]> = [
      ['main', 't:bot.message.welcome'],
      ['settings', 't:bot.route.settings'],
      ['settings.language', 't:bot.message.chooseLanguage'],
      ['settings.language.confirm', 't:bot.message.chooseLanguage'],
      ['support', 't:bot.route.support'],
      ['support.contact', 't:bot.route.support'],
      ['link', 't:bot.route.link'],
      ['link.instructions', 't:bot.route.link'],
    ];

    for (const [route, text] of expectations) {
      const current = ctx(route);
      expect(routeText(current, route)).toBe(text);
      expect(current.t).toHaveBeenCalled();
    }
  });

  it('localizes linked and unlinked profile status through ctx.t', () => {
    const unlinked = ctx('profile');
    expect(routeText(unlinked, 'profile')).toBe('t:bot.message.profileNotLinked');
    expect(unlinked.t).toHaveBeenCalledWith('bot.message.profileNotLinked');

    const linked = ctx('profile');
    linked.session.auth.linked = true;
    expect(routeText(linked, 'profile')).toBe('t:bot.message.profileLinked');
    expect(linked.t).toHaveBeenCalledWith('bot.message.profileLinked');
  });

  it('replies for the current route while preserving the last menu id', async () => {
    const current = ctx('settings');
    const reply = vi.fn(() => Promise.resolve(undefined));
    current.reply = reply as never;
    current.session.lastMenuId = 'telegram:menu:settings';

    await replyWithCurrentRoute(current);
    await replyForRoute(current, 'support');
    current.session.lastMenuId = undefined;
    await replyForRoute(current, 'main');

    expect(reply.mock.calls).toEqual([['t:bot.route.settings'], ['t:bot.route.support'], ['t:bot.message.welcome']]);
    expect(current.session.lastMenuId).toBe('telegram:menu:main');
  });

  it('falls back to main when an invalid stack entry is encountered', () => {
    const current = ctx('settings');
    current.session.stack = [undefined as never];

    expect(goBack(current)).toBe('main');
    expect(current.session.currentRoute).toBe('main');
  });
});
