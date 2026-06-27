import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import {
  BaseHealthController,
  HealthService,
} from "@app/backend/common/health";
import { TelegramWebhookController } from "./telegram-webhook.controller";
import { TelegramBotApiModule } from "./telegram-bot-api.module";

describe("TelegramBotApiModule", () => {
  it("wires the bot feature, shared health controller, and health service", async () => {
    let moduleRef: TestingModule | undefined;
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const previousMode = process.env.TELEGRAM_BOT_MODE;

    process.env.TELEGRAM_BOT_TOKEN = "123:test";
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";
    process.env.TELEGRAM_BOT_MODE = "webhook";

    try {
      moduleRef = await Test.createTestingModule({
        imports: [TelegramBotApiModule],
      }).compile();

      expect(moduleRef.get(BaseHealthController)).toBeInstanceOf(
        BaseHealthController,
      );
      expect(moduleRef.get(HealthService).appName).toBe("telegram-bot-api");
      expect(moduleRef.get(TelegramWebhookController)).toBeInstanceOf(
        TelegramWebhookController,
      );
    } finally {
      restoreEnv("TELEGRAM_BOT_TOKEN", previousToken);
      restoreEnv("TELEGRAM_WEBHOOK_SECRET", previousWebhookSecret);
      restoreEnv("TELEGRAM_BOT_MODE", previousMode);
      await moduleRef?.close();
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
