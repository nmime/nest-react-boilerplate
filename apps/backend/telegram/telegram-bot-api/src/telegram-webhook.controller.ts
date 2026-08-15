import { Body, Controller, ForbiddenException, Headers, Inject, Post } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import {
  TelegramBotInstanceInjectToken,
  assertWebhookRuntimeAllowed,
  verifyWebhookSecret,
  type TelegramBotInstance,
} from '@app/backend-feature-telegram-bot';
import { InboundCallbackReplayGuard } from '@app/backend-common-redis';
import { telegramUpdateId, telegramUpdateIngress } from './telegram-update-ingress';

@Controller('telegram/webhook')
export class TelegramWebhookController implements OnApplicationBootstrap {
  private botInitPromise: Promise<void> | null = null;
  private readonly webhookSecret: string;
  private readonly webhookUrl: string;

  constructor(
    @Inject(TelegramBotInstanceInjectToken)
    private readonly telegram: TelegramBotInstance,
    private readonly replayProtection: InboundCallbackReplayGuard,
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

    const reservation = await this.replayProtection.reserve(telegramUpdateIngress, telegramUpdateId(update));
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
    // Reset the cached promise on rejection: if the one-time init (bot.init +
    // setWebhook) fails transiently, a permanently cached rejection would make
    // every subsequent webhook update 500 until the process restarts. Clearing
    // it lets the next update retry initialization.
    this.botInitPromise ??= this.initializeBot().catch((error: unknown) => {
      this.botInitPromise = null;
      throw error;
    });
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
