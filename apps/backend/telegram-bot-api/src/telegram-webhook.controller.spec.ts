import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TelegramWebhookController } from "./telegram-webhook.controller";
import type { TelegramBotInstance } from "@app/backend-bot-telegram";

function instance() {
  const handleUpdate = vi.fn(() => Promise.resolve(undefined));
  const telegram: TelegramBotInstance = {
    config: {
      token: "123:test",
      webhookSecret: "secret",
      mode: "webhook",
      environment: "test",
      sessionTtlSeconds: 60,
      rateLimit: { timeFrameMs: 1_000, limit: 10 },
    },
    menus: {} as never,
    bot: {
      handleUpdate,
      isRunning: () => false,
      start: vi.fn(),
    } as never,
  };
  return { telegram, handleUpdate };
}

describe("TelegramWebhookController", () => {
  it("rejects missing Telegram webhook secret headers", async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram);

    await expect(
      controller.handleWebhook(undefined, { update_id: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid Telegram webhook secret headers", async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram);

    await expect(
      controller.handleWebhook("wrong", { update_id: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("does not start when polling mode is configured for this API", () => {
    const { telegram } = instance();
    telegram.config.mode = "polling";

    expect(() => new TelegramWebhookController(telegram)).toThrow(
      "Telegram webhook runtime cannot start when TELEGRAM_BOT_MODE=polling.",
    );
  });

  it("accepts valid Telegram webhook secret headers", async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram);

    await expect(
      controller.handleWebhook("secret", { update_id: 1 }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });

  it("forwards raw update objects without reshaping them", async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram);
    const update = {
      update_id: 2,
      message: {
        message_id: 3,
        text: "/start payload",
        from: { id: 42 },
      },
    };

    await controller.handleWebhook("secret", update);

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate.mock.calls[0]?.[0]).toBe(update);
  });
});
