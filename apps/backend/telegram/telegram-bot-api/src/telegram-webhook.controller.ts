import { Body, Controller, ForbiddenException, Headers, Inject, Post } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  TelegramBotInstanceInjectToken,
  assertWebhookRuntimeAllowed,
  verifyWebhookSecret,
  type TelegramBotInstance,
} from '@app/backend-feature-telegram-bot';
import { TelegramUpdateReplayProtection } from './telegram-update-replay-protection';

@Controller('telegram/webhook')
export class TelegramWebhookController implements OnApplicationBootstrap {
  private botInitPromise: Promise<void> | null = null;
  private readonly webhookSecret: string;
  private readonly webhookUrl: string;

  constructor(
    @Inject(TelegramBotInstanceInjectToken)
    private readonly telegram: TelegramBotInstance,
    private readonly replayProtection: TelegramUpdateReplayProtection,
  ) {
    assertWebhookRuntimeAllowed(telegram.config);
    this.webhookSecret = telegram.config.webhookSecret;
    this.webhookUrl = telegram.config.webhookUrl;
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

    const reservation = await this.replayProtection.reserve(update);
    if (!reservation) {
      return { ok: true };
    }
    try {
      await this.ensureBotInitialized();
      await this.telegram.bot.handleUpdate(update as never);
    } catch (error) {
      await this.replayProtection.release(reservation);
      throw error;
    }
    await this.replayProtection.complete(reservation);
    return { ok: true };
  }

  private async ensureBotInitialized(): Promise<void> {
    this.botInitPromise ??= this.initializeBot();
    await this.botInitPromise;
  }

  private async initializeBot(): Promise<void> {
    await this.telegram.bot.init();
    await this.telegram.bot.api.setWebhook(this.webhookUrl, {
      allowed_updates: ['message', 'callback_query'],
      secret_token: this.webhookSecret,
    });
  }
}
