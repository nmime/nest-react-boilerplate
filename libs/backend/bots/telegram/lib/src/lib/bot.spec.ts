import { describe, expect, it, vi } from "vitest";
import { createTelegramBot } from "./bot";
import { goBack, goHome, navigateTo } from "./navigation";
import { initialTelegramBotSession } from "./session";
import type {
  TelegramBotAuthPort,
  TelegramBotConfig,
  TelegramBotSession,
} from "./types";

const botInfo = {
  id: 42,
  is_bot: true,
  first_name: "Test Bot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as const;

function config(overrides: Partial<TelegramBotConfig> = {}): TelegramBotConfig {
  return {
    token: "123:test",
    appUrl: "https://app.example.test",
    webhookSecret: "secret",
    mode: "webhook",
    environment: "test",
    sessionTtlSeconds: 60,
    rateLimit: { timeFrameMs: 10, limit: 20 },
    botInfo,
    ...overrides,
  };
}

let updateSequence = 1;

function nextId(): number {
  updateSequence += 1;
  return updateSequence;
}

function messageUpdate(text: string, language_code = "en") {
  return {
    update_id: nextId(),
    message: {
      message_id: nextId(),
      date: 1,
      chat: { id: 100, type: "private", first_name: "Ada" },
      from: {
        id: 100,
        is_bot: false,
        first_name: "Ada",
        username: "ada",
        language_code,
      },
      text,
      entities: text.startsWith("/")
        ? [
            {
              type: "bot_command",
              offset: 0,
              length: text.split(" ")[0].length,
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
        first_name: "Ada",
        username: "ada",
        language_code: "en",
      },
      message: {
        message_id: 10,
        date: 1,
        chat: { id: 100, type: "private", first_name: "Ada" },
        text: "menu",
      },
      chat_instance: "instance",
      data,
    },
  };
}

function apiMock() {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveRequestUrl(input);
      const method = url.split("/").at(-1) ?? "unknown";
      const body =
        init?.body ?? (input instanceof Request ? input.body : undefined);
      const payload = await parsePayload(body);
      calls.push({ method, payload });
      return new Response(
        JSON.stringify({
          ok: true,
          result: telegramResult(method, payload, calls.length),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );
  return { calls, fetchMock: fetchMock as typeof fetch };
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function telegramResult(
  method: string,
  payload: Record<string, unknown>,
  sequence: number,
): Record<string, unknown> {
  if (method !== "sendMessage") {
    return { ok: true };
  }

  return {
    message_id: sequence,
    date: 1,
    chat: { id: Number(payload.chat_id), type: "private" },
    text: payload.text,
  };
}

async function parsePayload(
  body: BodyInit | ReadableStream<Uint8Array> | null | undefined,
): Promise<Record<string, unknown>> {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
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
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("createTelegramBot", () => {
  it("handles /start with a localized public menu", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/start", "ru") as never);

    expect(calls.map((call) => call.payload.text)).toContain(
      "Добро пожаловать! Выберите действие.",
    );
    expect(calls.at(-1)?.payload.reply_markup).toBeDefined();
  });

  it("consumes a valid start payload and reports expired payloads", async () => {
    const { calls, fetchMock } = apiMock();
    const consumeLinkPayload = vi.fn((payload: string) =>
      Promise.resolve(
        payload === "valid"
          ? {
              kind: "route" as const,
              route: "settings.language" as const,
              locale: "ru" as const,
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

    await bot.handleUpdate(messageUpdate("/start valid") as never);
    await bot.handleUpdate(messageUpdate("/start expired") as never);

    expect(consumeLinkPayload).toHaveBeenCalledWith(
      "valid",
      expect.objectContaining({
        provider: "telegram",
        channel: "telegram_bot",
      }),
    );
    expect(calls.map((call) => call.payload.text)).toContain(
      "Действие бота истекло. Начните заново.",
    );
  });

  it("updates language in session and calls linked-user preference update", async () => {
    const { calls, fetchMock } = apiMock();
    const updateLinkedUserLocale = vi.fn(() => Promise.resolve(undefined));
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() =>
        Promise.resolve({
          userId: "user-1",
          tenantId: "tenant-1",
          locale: "en" as const,
        }),
      ),
      updateLinkedUserLocale,
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/language") as never);
    const markup = calls.at(-1)?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    const russian = markup.inline_keyboard
      .flat()
      .find((button) => button.text.includes("Russian"));
    expect(russian).toBeDefined();

    if (!russian) {
      throw new Error("Russian language button was not rendered.");
    }

    await bot.handleUpdate(callbackUpdate(russian.callback_data) as never);

    expect(updateLinkedUserLocale).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "ru",
        userId: "user-1",
        tenantId: "tenant-1",
      }),
    );
  });

  it("keeps deep navigation stack for Back and Home", () => {
    const ctx: { session: TelegramBotSession } = {
      session: initialTelegramBotSession(),
    };

    navigateTo(ctx as never, "settings");
    navigateTo(ctx as never, "settings.language");
    expect(ctx.session.stack).toEqual([
      "main",
      "settings",
      "settings.language",
    ]);
    expect(ctx.session.currentRoute).toBe("settings.language");

    expect(goBack(ctx as never)).toBe("settings");
    expect(ctx.session.currentRoute).toBe("settings");

    goHome(ctx as never);
    expect(ctx.session.stack).toEqual(["main"]);
    expect(ctx.session.currentRoute).toBe("main");
    expect(ctx.session.lastMenuId).toBe("telegram:menu:main");
  });

  it("rate limits rapid repeated updates", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(
      config({ rateLimit: { timeFrameMs: 60_000, limit: 1 } }),
      { fetch: fetchMock },
    );

    await bot.handleUpdate(messageUpdate("/start") as never);
    await bot.handleUpdate(messageUpdate("/start") as never);
    await waitForTelegramText(
      calls,
      "Too many bot actions. Please wait and try again.",
    );

    expect(calls.map((call) => call.payload.text)).toContain(
      "Too many bot actions. Please wait and try again.",
    );
  });
});
