import { describe, expect, it, vi } from 'vitest';
import { createTelegramBot, handleLink, handleStart, telegramBotCommands } from './bot';
import { goBack, goHome, navigateTo } from '../navigation';
import { initialTelegramBotSession } from './session';
import type { TelegramBotAuthPort, TelegramBotConfig, TelegramBotSession } from '../type';

const botInfo = {
  id: 42,
  is_bot: true,
  first_name: 'Test Bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as const;

function config(overrides: Partial<TelegramBotConfig> = {}): TelegramBotConfig {
  return {
    token: '123:test',
    appUrl: 'https://app.example.test/tma',
    setupMenuButton: false,
    webhookSecret: 'secret',
    mode: 'webhook',
    environment: 'test',
    sessionTtlSeconds: 60,
    rateLimit: { timeFrameMs: 10, limit: 20 },
    botInfo,
    ...overrides,
  };
}

function configuredWebAppButtons(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
): Array<{ text?: string; web_app?: { url?: string } }> {
  return calls.flatMap((call) => flattenButtons(call.payload).filter((button) => Boolean(button.web_app)));
}

function visibleTelegramText(calls: Array<{ method: string; payload: Record<string, unknown> }>): string[] {
  return calls.flatMap((call) => [
    typeof call.payload.text === 'string' ? call.payload.text : '',
    ...flattenButtons(call.payload).flatMap((button) => [
      button.text ?? '',
      button.url ?? '',
      button.web_app?.url ?? '',
    ]),
  ]);
}

let updateSequence = 1;

function nextId(): number {
  updateSequence += 1;
  return updateSequence;
}

function messageUpdate(text: string, languageCode = 'en') {
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      date: 1,
      chat: { id: 100, type: 'private', first_name: 'Ada' },
      from: {
        id: 100,
        is_bot: false,
        first_name: 'Ada',
        username: 'ada',
        language_code: languageCode,
      },
      text,
      entities: text.startsWith('/')
        ? [
            {
              type: 'bot_command',
              offset: 0,
              length: text.split(' ')[0].length,
            },
          ]
        : undefined,
    },
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: nextId(),
    callback_query: {
      id: String(nextId()),
      from: {
        id: 100,
        is_bot: false,
        first_name: 'Ada',
        username: 'ada',
        language_code: 'en',
      },
      message: {
        message_id: 10,
        date: 1,
        chat: { id: 100, type: 'private', first_name: 'Ada' },
        text: 'menu',
      },
      chat_instance: 'instance',
      data,
    },
  };
}

function texts(calls: Array<{ method: string; payload: Record<string, unknown> }>) {
  return calls.filter((call) => call.method === 'sendMessage').map((call) => call.payload.text);
}

function flattenButtons(payload: Record<string, unknown>) {
  const markup = payload.reply_markup as
    | {
        inline_keyboard?: Array<
          Array<{
            callback_data?: string;
            text?: string;
            url?: string;
            web_app?: { url?: string };
          }>
        >;
      }
    | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
}

function apiMock(
  options: {
    failAnswerCallbackQuery?: boolean;
    failEditMessageText?: boolean;
    failSendMessageText?: string;
  } = {},
) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveRequestUrl(input);
    const method = url.split('/').at(-1) ?? 'unknown';
    const body = init?.body ?? (input instanceof Request ? input.body : undefined);
    const payload = await parsePayload(body);
    calls.push({ method, payload });
    if (options.failAnswerCallbackQuery && method === 'answerCallbackQuery') {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: callback query is too old',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    if (options.failSendMessageText && method === 'sendMessage' && payload.text === options.failSendMessageText) {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      );
    }
    if (options.failEditMessageText && method === 'editMessageText') {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: message is not modified',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        result: telegramResult(method, payload, calls.length),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  return { calls, fetchMock: fetchMock as typeof fetch };
}

function latestPayload(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
  method: string,
): Record<string, unknown> {
  return [...calls].reverse().find((call) => call.method === method)?.payload ?? {};
}

function buttonByText(
  payload: Record<string, unknown>,
  text: string,
): {
  callback_data?: string;
  text?: string;
  url?: string;
  web_app?: { url?: string };
} {
  const button = flattenButtons(payload).find((candidate) => candidate.text?.includes(text));

  if (!button) {
    throw new Error(`Button containing "${text}" was not rendered.`);
  }

  return button;
}

function callbackDataFor(payload: Record<string, unknown>, text: string): string {
  const callbackData = buttonByText(payload, text).callback_data;

  if (!callbackData) {
    throw new Error(`Button containing "${text}" did not have callback data.`);
  }

  return callbackData;
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function telegramResult(method: string, payload: Record<string, unknown>, sequence: number): Record<string, unknown> {
  if (method === 'answerCallbackQuery') {
    return { ok: true };
  }

  if (method !== 'sendMessage' && method !== 'editMessageText') {
    return { ok: true };
  }

  return {
    message_id: sequence,
    date: 1,
    chat: { id: Number(payload.chat_id), type: 'private' },
    text: payload.text,
  };
}

async function parsePayload(
  body: NonNullable<RequestInit['body']> | ReadableStream<Uint8Array> | null | undefined,
): Promise<Record<string, unknown>> {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>;
  }

  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }

  if (body instanceof FormData) {
    return Object.fromEntries(body.entries());
  }
  if (body instanceof ReadableStream) {
    const text = await new Response(body).text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return Object.fromEntries(new URLSearchParams(text).entries());
    }
  }
  return {};
}

async function waitForTelegramText(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
  text: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (calls.some((call) => call.payload.text === text)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- polling wait is sequential by design
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('createTelegramBot', () => {
  it('handles /start with a localized public menu', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start', 'ru') as never);

    expect(calls.map((call) => call.payload.text)).toContain('Добро пожаловать! Выберите действие.');
    expect(calls.at(-1)?.payload.reply_markup).toBeDefined();

    const buttons = flattenButtons(calls.at(-1)?.payload ?? {});
    expect(buttons.map((button) => button.text)).toEqual([
      'Профиль',
      'Настройки',
      'Поддержка',
      'Привязать аккаунт',
      'Открыть приложение',
    ]);
    expect(visibleTelegramText(calls).join('\n')).not.toContain('Welcome! Choose an action.');
  });

  it('renders stable short main-menu callback data', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);

    const buttons = flattenButtons(calls.at(-1)?.payload ?? {});
    const callbackData = buttons.flatMap((button) => (button.callback_data ? [button.callback_data] : []));
    expect(buttons.map((button) => button.text)).toEqual([
      'Profile',
      'Settings',
      'Support',
      'Link account',
      'Open app',
    ]);
    expect(callbackData).toHaveLength(4);
    expect(new Set(callbackData).size).toBe(callbackData.length);
    expect(callbackData.every((data) => data.length <= 64)).toBe(true);
    expect(visibleTelegramText(calls).join('\n')).not.toMatch(/\{\{|\}\}/u);
  });

  it('hides Open App when no safe frontend or TMA URL is configured', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ appUrl: 'https://telegram-bot.example.test/' }), {
      fetch: fetchMock,
    });

    await bot.handleUpdate(messageUpdate('/start', 'ru') as never);

    expect(configuredWebAppButtons(calls)).toEqual([]);
    expect(flattenButtons(calls.at(-1)?.payload ?? {}).map((button) => button.text)).toEqual([
      'Профиль',
      'Настройки',
      'Поддержка',
      'Привязать аккаунт',
    ]);
  });

  it('uses only a safe configured frontend Mini App URL for Open App', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ appUrl: 'https://frontend.example.test/telegram-mini-app' }), {
      fetch: fetchMock,
    });

    await bot.handleUpdate(messageUpdate('/start') as never);

    expect(configuredWebAppButtons(calls)).toEqual([
      {
        text: 'Open app',
        web_app: { url: 'https://frontend.example.test/telegram-mini-app' },
      },
    ]);
    expect(
      configuredWebAppButtons(calls)
        .map((button) => button.web_app?.url)
        .join('\n'),
    ).not.toMatch(/telegram-bot\.n0xeid\.xyz\/?$|\/telegram\/webhook$/u);
  });

  it('handles every private-chat user menu command and provides a dedicated Mini App launch button', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    for (const command of ['/profile', '/settings', '/support', '/link']) {
      // Each update mutates one bot session, so exercising the menu sequentially
      // mirrors Telegram delivery and avoids testing impossible concurrent navigation.
      // eslint-disable-next-line no-await-in-loop -- session-backed updates must remain ordered
      await bot.handleUpdate(messageUpdate(command) as never);
      expect(latestPayload(calls, 'sendMessage').reply_markup).toBeDefined();
    }

    await bot.handleUpdate(messageUpdate('/app') as never);
    expect(
      configuredWebAppButtons([
        {
          method: 'sendMessage',
          payload: latestPayload(calls, 'sendMessage'),
        },
      ]),
    ).toEqual([
      {
        text: 'Open app',
        web_app: { url: 'https://app.example.test/tma' },
      },
    ]);
  });

  it('builds localized command menus and only advertises /app when a safe Mini App URL exists', () => {
    expect(telegramBotCommands('en', true).map(({ command }) => command)).toEqual([
      'start',
      'app',
      'profile',
      'settings',
      'language',
      'support',
      'link',
    ]);
    expect(telegramBotCommands('ru', true).find(({ command }) => command === 'app')?.description).toBe(
      'Открыть приложение',
    );
    expect(telegramBotCommands('en', false).map(({ command }) => command)).not.toContain('app');
  });

  it('publishes localized private-chat commands and the persistent app menu button when setup is enabled', async () => {
    const api = {
      config: { use: vi.fn() },
      setChatMenuButton: vi.fn(() => Promise.resolve(true as const)),
      setMyCommands: vi.fn(() => Promise.resolve(true as const)),
    };

    createTelegramBot(
      config({
        appUrl: 'https://frontend.example.test/telegram-mini-app',
        setupMenuButton: true,
      }),
      { api: api as never },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.setMyCommands).toHaveBeenCalledTimes(2);
    expect(api.setMyCommands.mock.calls[0]?.[0].map(({ command }) => command)).toContain('app');
    expect(api.setMyCommands.mock.calls[0]?.[1]).toEqual({ scope: { type: 'all_private_chats' } });
    expect(api.setMyCommands.mock.calls[1]?.[1]).toEqual({
      scope: { type: 'all_private_chats' },
      language_code: 'ru',
    });
    expect(api.setChatMenuButton).toHaveBeenCalledWith({
      menu_button: {
        type: 'web_app',
        text: 'Open app',
        web_app: { url: 'https://frontend.example.test/telegram-mini-app' },
      },
    });

    const unsafeApi = {
      config: { use: vi.fn() },
      setChatMenuButton: vi.fn(() => Promise.resolve(true as const)),
      setMyCommands: vi.fn(() => Promise.resolve(true as const)),
    };
    createTelegramBot(
      config({
        appUrl: 'https://api.example.test/telegram/webhook',
        setupMenuButton: true,
      }),
      { api: unsafeApi as never },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(unsafeApi.setChatMenuButton).not.toHaveBeenCalled();
    expect(unsafeApi.setMyCommands).toHaveBeenCalledTimes(2);
    expect(unsafeApi.setMyCommands.mock.calls[0]?.[0].map(({ command }) => command)).not.toContain('app');
  });

  it('does not fail startup when persistent chat menu button setup is rejected', async () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const api = {
      config: { use: vi.fn() },
      setChatMenuButton: vi.fn(() => Promise.reject(new Error('Telegram API unavailable'))),
      setMyCommands: vi.fn(() => Promise.resolve(true as const)),
    };

    expect(() =>
      createTelegramBot(
        config({
          appUrl: 'https://frontend.example.test/telegram-mini-app',
          setupMenuButton: true,
        }),
        { api: api as never },
      ),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stderrWrite).toHaveBeenCalledWith('Telegram bot menu button setup failed Error: Telegram API unavailable\n');
    stderrWrite.mockRestore();
  });

  it('consumes a valid start payload and reports expired payloads', async () => {
    const { calls, fetchMock } = apiMock();
    const consumeLinkPayload = vi.fn((payload: string) => {
      if (payload === 'valid') {
        return Promise.resolve({
          kind: 'route' as const,
          route: 'settings.language' as const,
          locale: 'ru' as const,
        });
      }

      if (payload === 'plain') {
        return Promise.resolve({
          kind: 'route' as const,
          route: 'settings' as const,
        });
      }

      return Promise.resolve(null);
    });
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload,
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() => Promise.resolve(null)),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start valid') as never);
    await bot.handleUpdate(messageUpdate('/start plain') as never);
    await bot.handleUpdate(messageUpdate('/start expired') as never);

    expect(consumeLinkPayload).toHaveBeenCalledWith(
      'valid',
      expect.objectContaining({
        provider: 'telegram',
        channel: 'telegram_bot',
      }),
    );
    expect(calls.map((call) => call.payload.text)).toContain('Действие бота истекло. Начните заново.');
    expect(consumeLinkPayload).toHaveBeenCalledWith('plain', expect.objectContaining({ channel: 'telegram_bot' }));
  });

  it('applies link start payloads and keeps unknown payloads on the fallback path', async () => {
    const { calls, fetchMock } = apiMock();
    const consumeLinkPayload = vi.fn((payload: string) =>
      Promise.resolve(
        payload === 'link-ok'
          ? {
              kind: 'link' as const,
              token: 'opaque-link-token',
              locale: 'ru' as const,
            }
          : null,
      ),
    );
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload,
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() => Promise.resolve(null)),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start link-ok') as never);
    await bot.handleUpdate(messageUpdate('/start unknown') as never);

    expect(texts(calls)).toEqual(
      expect.arrayContaining([
        'Ваш аккаунт привязан.',
        'Добро пожаловать! Выберите действие.',
        'Действие бота истекло. Начните заново.',
      ]),
    );
    expect(consumeLinkPayload).toHaveBeenCalledWith('unknown', expect.objectContaining({ channel: 'telegram_bot' }));
  });

  it('falls back when a start payload cannot be consumed without an auth port', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start route:settings') as never);

    expect(texts(calls)).toEqual(
      expect.arrayContaining(['This bot action expired. Please start again.', 'Welcome! Choose an action.']),
    );
  });

  it('uses linked user locale before Telegram language code', async () => {
    const { calls, fetchMock } = apiMock();
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() =>
        Promise.resolve({
          userId: 'user-1',
          tenantId: 'tenant-1',
          locale: 'ru' as const,
        }),
      ),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start', 'en-US') as never);

    expect(texts(calls)).toContain('Добро пожаловать! Выберите действие.');
  });

  it('creates link instructions from Telegram identity instead of frontend trust', async () => {
    const { calls, fetchMock } = apiMock();
    const createLinkInstructions = vi.fn(() => Promise.resolve('Open the account-link page from this Telegram chat.'));
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions,
      findLinkedUser: vi.fn(() => Promise.resolve(null)),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/link', 'ru-RU') as never);

    expect(createLinkInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'telegram',
        channel: 'telegram_bot',
        providerSubject: '100',
        username: 'ada',
        displayName: 'Ada',
        locale: 'ru',
      }),
    );
    expect(texts(calls)).toContain('Open the account-link page from this Telegram chat.');
  });

  it('uses localized link instructions when auth is unavailable', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ appUrl: undefined }), {
      fetch: fetchMock,
    });

    await bot.handleUpdate(messageUpdate('/link', 'ru') as never);

    expect(texts(calls)).toContain('Начинаем привязку аккаунта.');
    expect(configuredWebAppButtons(calls)).toEqual([]);
  });

  it('renders the main menu for regular text messages', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('hello') as never);

    expect(texts(calls)).toContain('Welcome! Choose an action.');
  });

  it('falls back to localized link text when instructions are unavailable from a menu callback', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Link')) as never);
    await bot.handleUpdate(
      callbackUpdate(
        callbackDataFor(latestPayload(calls, 'editMessageText'), 'auth.social.button.linkTelegram'),
      ) as never,
    );

    expect(latestPayload(calls, 'editMessageText').text).toBe('Starting account link.');
  });

  it('covers exported start and link handlers with default dependency resolution', async () => {
    const replies: Array<{ text: unknown; extra?: unknown }> = [];
    const ctx = {
      identity: null,
      match: ' payload ',
      session: initialTelegramBotSession(),
      t: (key: string) => `t:${key}`,
      reply: vi.fn((text: unknown, extra?: unknown) => {
        replies.push({ text, extra });
        return Promise.resolve();
      }),
    };

    await handleStart(ctx as never);
    await handleLink(ctx as never);

    expect(replies.map((reply) => reply.text)).toEqual([
      't:bot.error.expired',
      't:bot.message.welcome',
      't:bot.route.link',
    ]);
    expect(ctx.session.currentRoute).toBe('link');
    expect(ctx.reply).toHaveBeenCalledTimes(3);
  });

  it('edits existing messages for callback navigation and keeps Back and Home compact', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    const mainButtons = flattenButtons(calls.at(-1)?.payload ?? {});
    const settings = mainButtons.find((button) => button.text === 'Settings');

    expect(settings?.callback_data).toBeDefined();
    if (!settings?.callback_data) {
      throw new Error('Settings callback was not rendered.');
    }

    await bot.handleUpdate(callbackUpdate(settings.callback_data) as never);

    expect(calls.map((call) => call.method)).toContain('editMessageText');
    expect(calls.filter((call) => call.method === 'sendMessage')).toHaveLength(1);
    expect(calls.map((call) => call.method)).toContain('answerCallbackQuery');

    const settingsEdit = [...calls].reverse().find((call) => call.method === 'editMessageText');
    expect(settingsEdit?.payload.text).toBe('Opening settings.');
    const back = flattenButtons(settingsEdit?.payload ?? {}).find((button) => button.text === 'Back');
    expect(back?.callback_data).toBeDefined();
    if (!back?.callback_data) {
      throw new Error('Back callback was not rendered.');
    }

    await bot.handleUpdate(callbackUpdate(back.callback_data) as never);

    const homeEdit = [...calls].reverse().find((call) => call.method === 'editMessageText');
    expect(homeEdit?.payload.text).toBe('Welcome! Choose an action.');
    expect(calls.filter((call) => call.method === 'sendMessage')).toHaveLength(1);

    await bot.handleUpdate(messageUpdate('/start') as never);
    const secondSettings = callbackDataFor(latestPayload(calls, 'sendMessage'), 'Settings');
    await bot.handleUpdate(callbackUpdate(secondSettings) as never);
    const home = callbackDataFor(latestPayload(calls, 'editMessageText'), 'Home');
    await bot.handleUpdate(callbackUpdate(home) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');
  }, 10_000);

  it('updates language in session and calls linked-user preference update', async () => {
    const { calls, fetchMock } = apiMock();
    const updateLinkedUserLocale = vi.fn(() => Promise.resolve(undefined));
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() =>
        Promise.resolve({
          userId: 'user-1',
          tenantId: 'tenant-1',
          locale: 'en' as const,
        }),
      ),
      updateLinkedUserLocale,
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/language') as never);
    const markup = calls.at(-1)?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    const russian = markup.inline_keyboard.flat().find((button) => button.text.includes('Russian'));
    expect(russian).toBeDefined();

    if (!russian) {
      throw new Error('Russian language button was not rendered.');
    }

    await bot.handleUpdate(callbackUpdate(russian.callback_data) as never);

    expect(updateLinkedUserLocale).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'ru',
        userId: 'user-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('traverses profile, link, language, support, and home menu callbacks', async () => {
    const { calls, fetchMock } = apiMock();
    const createLinkInstructions = vi.fn(() => Promise.resolve('Open this Telegram-only link from your account page.'));
    const updateLinkedUserLocale = vi.fn(() => Promise.resolve(undefined));
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions,
      findLinkedUser: vi.fn(() =>
        Promise.resolve({
          userId: 'user-1',
          tenantId: 'tenant-1',
          locale: 'en' as const,
        }),
      ),
      updateLinkedUserLocale,
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Profile')) as never);

    expect(latestPayload(calls, 'editMessageText').text).toContain('Telegram auth.social.status.linked');

    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Link')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Starting account link.');

    await bot.handleUpdate(
      callbackUpdate(
        callbackDataFor(latestPayload(calls, 'editMessageText'), 'auth.social.button.linkTelegram'),
      ) as never,
    );
    expect(createLinkInstructions).toHaveBeenCalledWith(expect.objectContaining({ providerSubject: '100' }));
    expect(latestPayload(calls, 'editMessageText').text).toBe('Open this Telegram-only link from your account page.');

    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Language')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Choose your bot language.');

    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Russian')) as never,
    );
    expect(updateLinkedUserLocale).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'ru',
        userId: 'user-1',
        tenantId: 'tenant-1',
      }),
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Выберите язык бота.');

    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Назад')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Выберите язык бота.');

    await bot.handleUpdate(messageUpdate('/start', 'ru') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Support')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening support options.');

    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Opening support options')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening support options.');
  }, 15_000);

  it('warns users when callback message edits fail', async () => {
    const failingApi = apiMock({ failEditMessageText: true });
    const { bot: failingBot } = createTelegramBot(config(), {
      fetch: failingApi.fetchMock,
    });

    await failingBot.handleUpdate(messageUpdate('/start') as never);
    const support = callbackDataFor(latestPayload(failingApi.calls, 'sendMessage'), 'Support');
    await failingBot.handleUpdate(callbackUpdate(support) as never);

    expect(failingApi.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['editMessageText', 'answerCallbackQuery']),
    );
    expect(
      failingApi.calls.filter((call) => call.method === 'answerCallbackQuery').map((call) => call.payload.text),
    ).toContain('The bot could not complete this action.');
  });

  it('covers secondary menu navigation buttons', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ rateLimit: { timeFrameMs: 10, limit: 100 } }), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Profile')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Back')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Profile')) as never);
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Settings')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening settings.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Profile')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Home')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Settings')) as never);
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Language')) as never,
    );
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Back')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening settings.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Settings')) as never);
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Language')) as never,
    );
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Home')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Settings')) as never);
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Language')) as never,
    );
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'English')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Choose your bot language.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Settings')) as never);
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Support')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening support options.');
    await bot.handleUpdate(
      callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Settings')) as never,
    );
    expect(latestPayload(calls, 'editMessageText').text).toBe('Opening settings.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Support')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Home')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Support')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Back')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Link')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Home')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'sendMessage'), 'Link')) as never);
    await bot.handleUpdate(callbackUpdate(callbackDataFor(latestPayload(calls, 'editMessageText'), 'Back')) as never);
    expect(latestPayload(calls, 'editMessageText').text).toBe('Welcome! Choose an action.');
  }, 60_000);

  it('answers unknown callback data through the fallback callback handler', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(callbackUpdate('telegram:menu:unknown') as never);

    expect(calls.filter((call) => call.method === 'answerCallbackQuery').map((call) => call.payload.text)).toContain(
      'The bot could not complete this action.',
    );
  });

  it('keeps deep navigation stack for Back and Home', () => {
    const ctx: { session: TelegramBotSession } = {
      session: initialTelegramBotSession(),
    };

    navigateTo(ctx as never, 'settings');
    navigateTo(ctx as never, 'settings.language');
    expect(ctx.session.stack).toEqual(['main', 'settings', 'settings.language']);
    expect(ctx.session.currentRoute).toBe('settings.language');

    expect(goBack(ctx as never)).toBe('settings');
    expect(ctx.session.currentRoute).toBe('settings');

    goHome(ctx as never);
    expect(ctx.session.stack).toEqual(['main']);
    expect(ctx.session.currentRoute).toBe('main');
    expect(ctx.session.lastMenuId).toBe('telegram:menu:main');

    ctx.session.stack = [];
    ctx.session.currentRoute = 'profile';
    navigateTo(ctx as never, 'main');
    expect(ctx.session.stack).toEqual(['main', 'main']);

    ctx.session.stack = ['main'];
    ctx.session.currentRoute = 'main';
    navigateTo(ctx as never, 'settings');
    navigateTo(ctx as never, 'settings');
    expect(ctx.session.stack).toEqual(['main', 'settings']);

    for (const route of [
      'profile',
      'settings',
      'settings.language',
      'support',
      'link',
      'profile',
      'settings',
      'support',
      'link',
    ] as const) {
      navigateTo(ctx as never, route);
    }
    expect(ctx.session.stack).toHaveLength(8);

    ctx.session.stack = [];
    expect(goBack(ctx as never)).toBe('main');
    expect(ctx.session.stack).toEqual(['main']);
  });

  it('rate limits rapid repeated updates', async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ rateLimit: { timeFrameMs: 60_000, limit: 1 } }), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(messageUpdate('/start') as never);
    await waitForTelegramText(calls, 'Too many bot actions. Please wait and try again.');

    expect(calls.map((call) => call.payload.text)).toContain('Too many bot actions. Please wait and try again.');
  });

  it('logs when a rate-limit notice cannot be sent', async () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { fetchMock } = apiMock({
      failSendMessageText: 'Too many bot actions. Please wait and try again.',
    });
    const { bot } = createTelegramBot(config({ rateLimit: { timeFrameMs: 60_000, limit: 1 } }), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate('/start') as never);
    await bot.handleUpdate(messageUpdate('/start') as never);

    expect(stderrWrite.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'Telegram bot rate-limit reply failed',
    );
    stderrWrite.mockRestore();
  });
});
