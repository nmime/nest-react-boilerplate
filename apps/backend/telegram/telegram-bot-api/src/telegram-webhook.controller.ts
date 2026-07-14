import { Body, Controller, ForbiddenException, Headers, Inject, Post } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  TelegramBotInstanceInjectToken,
  assertWebhookRuntimeAllowed,
  verifyWebhookSecret,
  type TelegramBotInstance,
} from '@app/backend-feature-telegram-bot';

@Controller('telegram/webhook')
export class TelegramWebhookController implements OnApplicationBootstrap {
  private botInitPromise: Promise<void> | null = null;

  constructor(
    @Inject(TelegramBotInstanceInjectToken)
    private readonly telegram: TelegramBotInstance,
  ) {
    assertWebhookRuntimeAllowed(telegram.config);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureBotInitialized();
  }

  @Post()
  async handleWebhook(
    @Headers('x-telegram-bot-api-secret-token')
    secretHeader: string | undefined,
    @Body() update: unknown,
  ): Promise<{ ok: true }> {
    if (
      !verifyWebhookSecret({
        configuredSecret: this.telegram.config.webhookSecret,
        header: secretHeader,
      })
    ) {
      throw new ForbiddenException('telegram_webhook_secret_invalid');
    }

    await this.ensureBotInitialized();
    await this.telegram.bot.handleUpdate(update as never);
    return { ok: true };
  }

  private async ensureBotInitialized(): Promise<void> {
    this.botInitPromise ??= this.telegram.bot.init();
    await this.botInitPromise;
  }
}
