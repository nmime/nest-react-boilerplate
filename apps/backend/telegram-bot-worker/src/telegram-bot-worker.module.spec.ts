import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { TelegramBotWorkerService } from "./telegram-bot-worker.service";
import { TelegramBotWorkerModule } from "./telegram-bot-worker.module";

describe("TelegramBotWorkerModule", () => {
  it("wires the bot feature module and the polling worker service", async () => {
    let moduleRef: TestingModule | undefined;
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousMode = process.env.TELEGRAM_BOT_MODE;

    process.env.TELEGRAM_BOT_TOKEN = "123:test";
    process.env.TELEGRAM_BOT_MODE = "polling";

    try {
      moduleRef = await Test.createTestingModule({
        imports: [TelegramBotWorkerModule],
      }).compile();

      expect(moduleRef.get(TelegramBotWorkerService)).toBeInstanceOf(
        TelegramBotWorkerService,
      );
    } finally {
      restoreEnv("TELEGRAM_BOT_TOKEN", previousToken);
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
