import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Post,
} from "@nestjs/common";
import { webhookCallback } from "grammy";
import {
  TELEGRAM_BOT_INSTANCE,
  assertWebhookRuntimeAllowed,
  verifyWebhookSecret,
  type TelegramBotInstance,
} from "@app/backend-bot-telegram";

@Controller("telegram/webhook")
export class TelegramWebhookController {
  private readonly callback: (request: unknown, response: unknown) => unknown;

  constructor(
    @Inject(TELEGRAM_BOT_INSTANCE)
    private readonly telegram: TelegramBotInstance,
  ) {
    assertWebhookRuntimeAllowed(telegram.config);
    this.callback = webhookCallback(telegram.bot, "fastify", {
      secretToken: telegram.config.webhookSecret,
    }) as (request: unknown, response: unknown) => unknown;
  }

  @Post()
  async handleWebhook(
    @Headers("x-telegram-bot-api-secret-token")
    secretHeader: string | undefined,
    @Body() update: unknown,
  ): Promise<{ ok: true }> {
    if (
      !verifyWebhookSecret({
        configuredSecret: this.telegram.config.webhookSecret,
        header: secretHeader,
      })
    ) {
      throw new ForbiddenException("telegram_webhook_secret_invalid");
    }

    await this.telegram.bot.handleUpdate(update as never);
    return { ok: true };
  }
}
