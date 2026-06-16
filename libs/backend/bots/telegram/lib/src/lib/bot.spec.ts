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
    appUrl: "https://app.example.test/tma",
    webhookSecret: "secret",
    mode: "webhook",
    environment: "test",
    sessionTtlSeconds: 60,
    rateLimit: { timeFrameMs: 10, limit: 20 },
    botInfo,
    ...overrides,
  };
}

function configuredUrlButtons(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
): Array<{ text?: string; url?: string }> {
  return calls.flatMap((call) =>
    flattenButtons(call.payload).filter((button) => Boolean(button.url)),
  );
}

function visibleTelegramText(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
): string[] {
  return calls.flatMap((call) => [
    typeof call.payload.text === "string" ? call.payload.text : "",
    ...flattenButtons(call.payload).flatMap((button) => [
      button.text ?? "",
      button.url ?? "",
    ]),
  ]);
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

function texts(
  calls: Array<{ method: string; payload: Record<string, unknown> }>,
) {
  return calls
    .filter((call) => call.method === "sendMessage")
    .map((call) => call.payload.text);
}

function flattenButtons(payload: Record<string, unknown>) {
  const markup = payload.reply_markup as
    | { inline_keyboard?: Array<Array<Record<string, string>>> }
    | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
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
  if (method === "answerCallbackQuery") {
    return { ok: true };
  }

  if (method !== "sendMessage" && method !== "editMessageText") {
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

    const buttons = flattenButtons(calls.at(-1)?.payload ?? {});
    expect(buttons.map((button) => button.text)).toEqual([
      "Профиль",
      "Настройки",
      "Поддержка",
      "Привязать аккаунт",
      "Открыть приложение",
    ]);
    expect(visibleTelegramText(calls).join("\n")).not.toContain(
      "Welcome! Choose an action.",
    );
  });

  it("renders stable short main-menu callback data", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/start") as never);

    const buttons = flattenButtons(calls.at(-1)?.payload ?? {});
    const callbackData = buttons
      .map((button) => button.callback_data)
      .filter(Boolean);
    expect(buttons.map((button) => button.text)).toEqual([
      "Profile",
      "Settings",
      "Support",
      "Link account",
      "Open app",
    ]);
    expect(callbackData).toHaveLength(4);
    expect(new Set(callbackData).size).toBe(callbackData.length);
    expect(callbackData.every((data) => data.length <= 64)).toBe(true);
    expect(visibleTelegramText(calls).join("\n")).not.toMatch(/\{\{|\}\}/u);
  });

  it("hides Open App when no safe frontend or TMA URL is configured", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(
      config({ appUrl: "https://telegram-bot.example.test/" }),
      {
        fetch: fetchMock,
      },
    );

    await bot.handleUpdate(messageUpdate("/start", "ru") as never);

    expect(configuredUrlButtons(calls)).toEqual([]);
    expect(
      flattenButtons(calls.at(-1)?.payload ?? {}).map((button) => button.text),
    ).toEqual(["Профиль", "Настройки", "Поддержка", "Привязать аккаунт"]);
  });

  it("uses only a safe configured frontend or TMA URL for Open App", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(
      config({ appUrl: "https://frontend.example.test/tma" }),
      { fetch: fetchMock },
    );

    await bot.handleUpdate(messageUpdate("/start") as never);

    expect(configuredUrlButtons(calls)).toEqual([
      { text: "Open app", url: "https://frontend.example.test/tma" },
    ]);
    expect(
      configuredUrlButtons(calls)
        .map((button) => button.url)
        .join("\n"),
    ).not.toMatch(/telegram-bot\.n0xeid\.xyz\/?$|\/telegram\/webhook$/u);
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

  it("applies link start payloads and keeps unknown payloads on the fallback path", async () => {
    const { calls, fetchMock } = apiMock();
    const consumeLinkPayload = vi.fn((payload: string) =>
      Promise.resolve(
        payload === "link-ok"
          ? {
              kind: "link" as const,
              token: "opaque-link-token",
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

    await bot.handleUpdate(messageUpdate("/start link-ok") as never);
    await bot.handleUpdate(messageUpdate("/start unknown") as never);

    expect(texts(calls)).toEqual(
      expect.arrayContaining([
        "Ваш аккаунт привязан.",
        "Добро пожаловать! Выберите действие.",
        "Действие бота истекло. Начните заново.",
      ]),
    );
    expect(consumeLinkPayload).toHaveBeenCalledWith(
      "unknown",
      expect.objectContaining({ channel: "telegram_bot" }),
    );
  });

  it("falls back when a start payload cannot be consumed without an auth port", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/start route:settings") as never);

    expect(texts(calls)).toEqual(
      expect.arrayContaining([
        "This bot action expired. Please start again.",
        "Welcome! Choose an action.",
      ]),
    );
  });

  it("uses linked user locale before Telegram language code", async () => {
    const { calls, fetchMock } = apiMock();
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions: vi.fn(() => Promise.resolve(null)),
      findLinkedUser: vi.fn(() =>
        Promise.resolve({
          userId: "user-1",
          tenantId: "tenant-1",
          locale: "ru" as const,
        }),
      ),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/start", "en-US") as never);

    expect(texts(calls)).toContain("Добро пожаловать! Выберите действие.");
  });

  it("creates link instructions from Telegram identity instead of frontend trust", async () => {
    const { calls, fetchMock } = apiMock();
    const createLinkInstructions = vi.fn(() =>
      Promise.resolve("Open the account-link page from this Telegram chat."),
    );
    const auth: TelegramBotAuthPort = {
      consumeLinkPayload: vi.fn(() => Promise.resolve(null)),
      createLinkInstructions,
      findLinkedUser: vi.fn(() => Promise.resolve(null)),
      updateLinkedUserLocale: vi.fn(() => Promise.resolve(undefined)),
    };
    const { bot } = createTelegramBot(config(), { auth, fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/link", "ru-RU") as never);

    expect(createLinkInstructions).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "telegram",
        channel: "telegram_bot",
        providerSubject: "100",
        username: "ada",
        displayName: "Ada",
        locale: "ru",
      }),
    );
    expect(texts(calls)).toContain(
      "Open the account-link page from this Telegram chat.",
    );
  });

  it("uses localized link instructions when auth is unavailable", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config({ appUrl: undefined }), {
      fetch: fetchMock,
    });

    await bot.handleUpdate(messageUpdate("/link", "ru") as never);

    expect(texts(calls)).toContain("Начинаем привязку аккаунта.");
    expect(configuredUrlButtons(calls)).toEqual([]);
  });

  it("edits existing messages for callback navigation and keeps Back and Home compact", async () => {
    const { calls, fetchMock } = apiMock();
    const { bot } = createTelegramBot(config(), { fetch: fetchMock });

    await bot.handleUpdate(messageUpdate("/start") as never);
    const mainButtons = flattenButtons(calls.at(-1)?.payload ?? {});
    const settings = mainButtons.find((button) => button.text === "Settings");

    expect(settings?.callback_data).toBeDefined();
    if (!settings?.callback_data) {
      throw new Error("Settings callback was not rendered.");
    }

    await bot.handleUpdate(callbackUpdate(settings.callback_data) as never);

    expect(calls.map((call) => call.method)).toContain("editMessageText");
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(
      1,
    );
    expect(calls.map((call) => call.method)).toContain("answerCallbackQuery");

    const settingsEdit = [...calls]
      .reverse()
      .find((call) => call.method === "editMessageText");
    expect(settingsEdit?.payload.text).toBe("Opening settings.");
    const back = flattenButtons(settingsEdit?.payload ?? {}).find(
      (button) => button.text === "Back",
    );
    expect(back?.callback_data).toBeDefined();
    if (!back?.callback_data) {
      throw new Error("Back callback was not rendered.");
    }

    await bot.handleUpdate(callbackUpdate(back.callback_data) as never);

    const homeEdit = [...calls]
      .reverse()
      .find((call) => call.method === "editMessageText");
    expect(homeEdit?.payload.text).toBe("Welcome! Choose an action.");
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(
      1,
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
