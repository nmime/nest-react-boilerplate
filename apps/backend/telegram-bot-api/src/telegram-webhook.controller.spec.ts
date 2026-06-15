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
  it("rejects invalid Telegram webhook secret headers", async () => {
    const { telegram, handleUpdate } = instance();
    const controller = new TelegramWebhookController(telegram);

    await expect(
      controller.handleWebhook("wrong", { update_id: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handleUpdate).not.toHaveBeenCalled();
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
});
