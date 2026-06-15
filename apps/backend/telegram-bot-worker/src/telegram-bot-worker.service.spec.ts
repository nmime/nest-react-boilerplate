import { describe, expect, it, vi } from "vitest";
import { TelegramBotWorkerService } from "./telegram-bot-worker.service";
import type { TelegramBotInstance } from "@app/backend-bot-telegram";

vi.mock("@grammyjs/runner", () => ({
  run: vi.fn(() => ({
    stop: vi.fn(() => Promise.resolve(undefined)),
    isRunning: vi.fn(() => true),
    size: vi.fn(() => 0),
    task: vi.fn(() => undefined),
    start: vi.fn(),
  })),
}));

function instance(
  mode: "webhook" | "polling",
  environment: "production" | "development" | "test" = "development",
): TelegramBotInstance {
  return {
    config: {
      token: "123:test",
      webhookSecret: "secret",
      mode,
      environment,
      sessionTtlSeconds: 60,
      rateLimit: { timeFrameMs: 1_000, limit: 10 },
    },
    menus: {} as never,
    bot: {} as never,
  };
}

describe("TelegramBotWorkerService", () => {
  it("guards against polling when webhook mode is configured", () => {
    const service = new TelegramBotWorkerService(instance("webhook"));

    expect(() => service.onApplicationBootstrap()).toThrow(
      "Telegram polling runtime cannot start when TELEGRAM_BOT_MODE=webhook.",
    );
  });

  it("guards against polling in production", () => {
    const service = new TelegramBotWorkerService(
      instance("polling", "production"),
    );

    expect(() => service.onApplicationBootstrap()).toThrow(
      "Telegram polling runtime is disabled in production.",
    );
  });

  it("starts runner for local polling mode", () => {
    const service = new TelegramBotWorkerService(
      instance("polling", "development"),
    );

    service.onApplicationBootstrap();

    expect(service.isRunning()).toBe(true);
  });
});
