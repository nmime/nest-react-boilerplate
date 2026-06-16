import { describe, expect, it } from "vitest";
import {
  assertPollingRuntimeAllowed,
  assertWebhookRuntimeAllowed,
  resolveMode,
  resolveSafeTelegramAppUrl,
  resolveTelegramBotConfig,
  signStartPayload,
  verifyStartPayload,
  verifyWebhookSecret,
} from "./config";

describe("Telegram bot config", () => {
  it("requires a bot token before any runtime can start", () => {
    expect(() => resolveTelegramBotConfig({})).toThrow(
      "TELEGRAM_BOT_TOKEN is required.",
    );
  });

  it("defaults production to webhook mode and local runtimes to polling", () => {
    expect(resolveMode({}, "production")).toBe("webhook");
    expect(resolveMode({}, "development")).toBe("polling");
    expect(resolveMode({}, "test")).toBe("polling");
  });

  it("honors explicit webhook or polling modes and ignores unknown values", () => {
    expect(resolveMode({ TELEGRAM_BOT_MODE: " WEBHOOK " }, "development")).toBe(
      "webhook",
    );
    expect(resolveMode({ TELEGRAM_BOT_MODE: "polling" }, "production")).toBe(
      "polling",
    );
    expect(resolveMode({ TELEGRAM_BOT_MODE: "unknown" }, "production")).toBe(
      "webhook",
    );
  });

  it("parses positive TTL and rate limit overrides with safe fallbacks", () => {
    expect(
      resolveTelegramBotConfig({
        TELEGRAM_BOT_TOKEN: " test-token ",
        VITEST: "true",
        FRONTEND_URL: "https://app.example.test/tma",
        TELEGRAM_WEBHOOK_SECRET: " webhook-secret ",
        TELEGRAM_BOT_SESSION_TTL_SECONDS: "120",
        TELEGRAM_BOT_RATE_LIMIT_WINDOW_MS: "2500",
        TELEGRAM_BOT_RATE_LIMIT: "7",
      }),
    ).toMatchObject({
      token: "test-token",
      appUrl: "https://app.example.test/tma",
      webhookSecret: "webhook-secret",
      mode: "polling",
      environment: "test",
      sessionTtlSeconds: 120,
      rateLimit: { timeFrameMs: 2500, limit: 7 },
    });

    expect(
      resolveTelegramBotConfig({
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_BOT_SESSION_TTL_SECONDS: "0",
        TELEGRAM_BOT_RATE_LIMIT_WINDOW_MS: "nope",
        TELEGRAM_BOT_RATE_LIMIT: "-2",
      }),
    ).toMatchObject({
      sessionTtlSeconds: 1_209_600,
      rateLimit: { timeFrameMs: 1_000, limit: 3 },
    });
  });

  it("only exposes safe frontend or TMA URLs to Telegram app buttons", () => {
    expect(
      resolveSafeTelegramAppUrl({
        TELEGRAM_WEB_APP_URL: "https://app.example.test/tma",
        FRONTEND_URL: "https://fallback.example.test/app",
      }),
    ).toBe("https://app.example.test/tma");

    expect(
      resolveSafeTelegramAppUrl({
        APP_URL: "https://telegram-bot.n0xeid.xyz/",
        FRONTEND_URL: "https://frontend.example.test/app",
      }),
    ).toBe("https://frontend.example.test/app");

    for (const unsafe of [
      "https://telegram-bot.n0xeid.xyz/",
      "https://telegram-bot.n0xeid.xyz/telegram/webhook",
      "https://api.example.test/",
      "https://frontend.example.test/",
      "not-a-url",
    ]) {
      expect(
        resolveSafeTelegramAppUrl({ FRONTEND_URL: unsafe }),
      ).toBeUndefined();
    }
  });

  it("guards webhook and polling runtimes by configured mode/environment", () => {
    expect(() =>
      assertWebhookRuntimeAllowed({ mode: "webhook" }),
    ).not.toThrow();
    expect(() => assertWebhookRuntimeAllowed({ mode: "polling" })).toThrow(
      "Telegram webhook runtime cannot start when TELEGRAM_BOT_MODE=polling.",
    );

    expect(() =>
      assertPollingRuntimeAllowed({ mode: "polling", environment: "test" }),
    ).not.toThrow();
    expect(() =>
      assertPollingRuntimeAllowed({ mode: "webhook", environment: "test" }),
    ).toThrow(
      "Telegram polling runtime cannot start when TELEGRAM_BOT_MODE=webhook.",
    );
    expect(() =>
      assertPollingRuntimeAllowed({
        mode: "polling",
        environment: "production",
      }),
    ).toThrow("Telegram polling runtime is disabled in production.");
  });

  it("verifies webhook secrets without accepting missing or partial values", () => {
    expect(
      verifyWebhookSecret({
        configuredSecret: "webhook-secret",
        header: "webhook-secret",
      }),
    ).toBe(true);
    expect(
      verifyWebhookSecret({
        configuredSecret: "webhook-secret",
        header: ["webhook-secret"],
      }),
    ).toBe(true);
    expect(verifyWebhookSecret({ configuredSecret: "webhook-secret" })).toBe(
      false,
    );
    expect(
      verifyWebhookSecret({
        configuredSecret: "webhook-secret",
        header: "short",
      }),
    ).toBe(false);
    expect(
      verifyWebhookSecret({ configuredSecret: "", header: "webhook-secret" }),
    ).toBe(false);
  });

  it("round-trips signed start payloads and rejects malformed, tampered, or expired data", () => {
    const payload = signStartPayload(
      "route:settings.language:ru",
      "payload-secret",
      100,
    );

    expect(verifyStartPayload(payload, "payload-secret", 600, 100)).toBe(
      "route:settings.language:ru",
    );
    expect(
      verifyStartPayload("missing-signature", "payload-secret", 600, 100),
    ).toBe(null);
    expect(
      verifyStartPayload(`${payload}tampered`, "payload-secret", 600, 100),
    ).toBe(null);
    expect(verifyStartPayload(payload, "payload-secret", 10, 111)).toBe(null);
  });
});
