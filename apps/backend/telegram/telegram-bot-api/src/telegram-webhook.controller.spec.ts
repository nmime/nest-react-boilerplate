// @requirements REQ-SOCIAL-INGRESS-001
// Evidence for: REQ-SOCIAL-INGRESS-001
import { ForbiddenException } from '@nestjs/common';
// Security and domain evidence for REQ-SOCIAL-INGRESS-001.
import { describe, expect, it, vi } from 'vitest';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { createTelegramBot, type TelegramBotConfig, type TelegramBotInstance } from '@app/backend-feature-telegram-bot';
import { TelegramUpdateReplayProtection } from './telegram-update-replay-protection';

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

const testValue = <T>(value: unknown): T => value as T;

const replayProtection = () =>
  testValue<TelegramUpdateReplayProtection>({
    reserve: vi.fn(() => Promise.resolve({ key: 'telegram:1', ownerValue: 'processing:owner' })),
    complete: vi.fn(() => Promise.resolve()),
    release: vi.fn(() => Promise.resolve()),
  });

function instance() {
  const init = vi.fn(() => Promise.resolve(undefined));
  const handleUpdate = vi.fn<(update: unknown) => Promise<void>>(() => Promise.resolve());
  const setWebhook = vi.fn(() => Promise.resolve(true as const));
  const telegram: TelegramBotInstance = {
    config: {
      token: '123:test',
      setupMenuButton: false,
      webhookSecret: 'secret',
      webhookUrl: 'https://telegram-bot-api.example.test/telegram/webhook',
      mode: 'webhook',
      environment: 'test',
      sessionTtlSeconds: 60,
      rateLimit: { timeFrameMs: 1_000, limit: 10 },
    },
    menus: testValue<TelegramBotInstance['menus']>({}),
    bot: testValue<TelegramBotInstance['bot']>({
      init,
      handleUpdate,
      api: { setWebhook },
      isRunning: () => false,
      start: vi.fn(),
    }),
  };
  return { telegram, init, handleUpdate, setWebhook };
}

function config(overrides: Partial<TelegramBotConfig> = {}): TelegramBotConfig {
  return {
    token: '123:test',
    setupMenuButton: false,
    webhookSecret: 'secret',
    webhookUrl: 'https://telegram-bot-api.example.test/telegram/webhook',
    mode: 'webhook',
    environment: 'test',
    sessionTtlSeconds: 60,
    rateLimit: { timeFrameMs: 1_000, limit: 10 },
    ...overrides,
  };
}

function messageUpdate() {
  return {
    update_id: 2,
    message: {
      message_id: 3,
      date: 1,
      chat: { id: 100, type: 'private', first_name: 'Ada' },
      from: {
        id: 100,
        is_bot: false,
        first_name: 'Ada',
        username: 'ada',
        language_code: 'en',
      },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    },
  };
}

function apiMock() {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = resolveRequestUrl(input);
    const method = url.split('/').at(-1) ?? 'unknown';
    const body = init?.body ?? (input instanceof Request ? input.body : undefined);
    const payload = await parsePayload(body);
    calls.push({ method, payload });

    return new Response(
      JSON.stringify({
        ok: true,
        result: telegramResult(method),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  return { calls, fetchMock: fetchMock as typeof fetch };
}

function resolveRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

async function parsePayload(body: NonNullable<RequestInit['body']> | null | undefined) {
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
    return JSON.parse(await new Response(body).text()) as Record<string, unknown>;
  }

  return {};
}

function telegramResult(method: string): Record<string, unknown> {
  if (method === 'getMe') {
    return botInfo;
  }

  if (method === 'sendMessage') {
    return {
      message_id: 10,
      date: 1,
      chat: { id: 100, type: 'private' },
      text: 'ok',
    };
  }

  return { ok: true };
}

describe('TelegramWebhookController', () => {
  it('rejects missing Telegram webhook secret headers', async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());

    await expect(controller.handleWebhook(undefined, { update_id: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid Telegram webhook secret headers', async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());

    await expect(controller.handleWebhook('wrong', { update_id: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('does not start when polling mode is configured for this API', () => {
    const { telegram } = instance();
    telegram.config.mode = 'polling';

    expect(() => new TelegramWebhookController(telegram, replayProtection())).toThrow(
      'Telegram webhook runtime cannot start when TELEGRAM_BOT_MODE=polling.',
    );
  });

  it('rejects webhook mode when the public HTTPS webhook URL is missing', () => {
    const { telegram } = instance();
    telegram.config.webhookUrl = undefined;

    expect(() => new TelegramWebhookController(telegram, replayProtection())).toThrow(
      'Telegram webhook runtime requires a valid HTTPS TELEGRAM_BOT_WEBHOOK_URL ending in /telegram/webhook.',
    );
  });

  it('accepts valid Telegram webhook secret headers', async () => {
    const { telegram, init, handleUpdate, setWebhook } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());

    await expect(controller.handleWebhook('secret', { update_id: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(init).toHaveBeenCalledTimes(1);
    expect(setWebhook).toHaveBeenCalledWith('https://telegram-bot-api.example.test/telegram/webhook', {
      allowed_updates: ['message', 'callback_query'],
      secret_token: 'secret',
    });
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });

  it('forwards raw update objects without reshaping them', async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());
    const update = {
      update_id: 2,
      message: {
        message_id: 3,
        text: '/start payload',
        from: { id: 42 },
      },
    };

    await controller.handleWebhook('secret', update);

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate.mock.calls[0]?.[0]).toBe(update);
  });

  it('initializes the grammY bot before forwarding valid webhook updates', async () => {
    const { calls, fetchMock } = apiMock();
    const telegram = createTelegramBot(config(), { fetch: fetchMock });
    const controller = new TelegramWebhookController(telegram, replayProtection());

    await expect(controller.handleWebhook('secret', messageUpdate())).resolves.toEqual({ ok: true });

    expect(calls[0]?.method).toBe('getMe');
    expect(calls.some((call) => call.method === 'sendMessage')).toBe(true);
  });

  it('initializes the bot once on application bootstrap so webhook traffic is not delayed', async () => {
    const { telegram, init, handleUpdate, setWebhook } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());

    await controller.onApplicationBootstrap();
    await expect(controller.handleWebhook('secret', { update_id: 1 })).resolves.toEqual({ ok: true });

    expect(init).toHaveBeenCalledTimes(1);
    expect(setWebhook).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });

  it('does not dispatch a replayed update', async () => {
    const { telegram, handleUpdate } = instance();
    const replay = testValue<TelegramUpdateReplayProtection>({
      reserve: vi.fn().mockRejectedValue(new Error('replayed')),
    });
    const controller = new TelegramWebhookController(telegram, replay);

    await expect(controller.handleWebhook('secret', { update_id: 1 })).rejects.toThrow('replayed');
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('acknowledges a completed duplicate without dispatching it again', async () => {
    const { telegram, handleUpdate } = instance();
    const replay = testValue<TelegramUpdateReplayProtection>({
      reserve: vi.fn().mockResolvedValue(null),
    });
    const controller = new TelegramWebhookController(telegram, replay);

    await expect(controller.handleWebhook('secret', { update_id: 1 })).resolves.toEqual({ ok: true });
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('releases its reservation when update handling fails transiently', async () => {
    const { telegram, handleUpdate } = instance();
    handleUpdate.mockRejectedValueOnce(new Error('transient handler failure'));
    const replay = replayProtection();
    const controller = new TelegramWebhookController(telegram, replay);

    await expect(controller.handleWebhook('secret', { update_id: 1 })).rejects.toThrow('transient handler failure');
    expect(replay.release).toHaveBeenCalledWith({ key: 'telegram:1', ownerValue: 'processing:owner' });
    expect(replay.complete).not.toHaveBeenCalled();
  });

  it('does not release a handled update when completion storage fails', async () => {
    const { telegram, handleUpdate } = instance();
    const completionError = new Error('completion unavailable');
    const replay = testValue<TelegramUpdateReplayProtection>({
      reserve: vi.fn().mockResolvedValue({ key: 'telegram:1', ownerValue: 'processing:owner' }),
      complete: vi.fn().mockRejectedValue(completionError),
      release: vi.fn(),
    });
    const controller = new TelegramWebhookController(telegram, replay);

    await expect(controller.handleWebhook('secret', { update_id: 1 })).rejects.toBe(completionError);
    expect(handleUpdate).toHaveBeenCalledOnce();
    expect(replay.release).not.toHaveBeenCalled();
  });

  it('resets the cached init promise on failure so a later webhook can retry', async () => {
    const { telegram, init, handleUpdate, setWebhook } = instance();
    const controller = new TelegramWebhookController(telegram, replayProtection());

    // First init attempt fails transiently.
    init.mockRejectedValueOnce(new Error('transient init failure'));
    await expect(controller.handleWebhook('secret', { update_id: 1 })).rejects.toThrow('transient init failure');

    // The cached rejection must be cleared so the next webhook retries init.
    await expect(controller.handleWebhook('secret', { update_id: 2 })).resolves.toEqual({ ok: true });

    expect(init).toHaveBeenCalledTimes(2);
    expect(setWebhook).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 2 });
  });
});
