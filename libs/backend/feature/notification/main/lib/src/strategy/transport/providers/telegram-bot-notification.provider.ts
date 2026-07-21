import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationStatus,
  type NotificationMessageButton,
} from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';

@Injectable()
export class TelegramBotNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.TelegramBot;
  private readonly logger = new Logger(TelegramBotNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'bot') {
      return this.invalidMessage();
    }
    const token = this.config.botToken;
    if (!token) {
      return this.configurationError('BOT_TOKEN is required for Telegram notification delivery.');
    }

    const method = input.message.image ? 'sendPhoto' : 'sendMessage';
    const payload = input.message.image
      ? {
          chat_id: input.address,
          photo: input.message.image,
          caption: input.message.text,
          ...toTelegramOptions(input),
        }
      : { chat_id: input.address, text: input.message.text, ...toTelegramOptions(input) };

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as TelegramResponse;
      if (response.ok && result.ok !== false) {
        return { status: NotificationStatus.Sent };
      }
      return this.mapError(response.status, result.description);
    } catch (error) {
      this.logger.warn(`Telegram notification request failed: ${toSafeErrorMessage(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: toSafeErrorMessage(error),
      };
    }
  }

  private mapError(status: number, description: string | undefined): NotificationProviderSendResult {
    const message = description?.slice(0, 500);
    if (status === 429) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.RateLimit,
        errorMessage: message,
      };
    }
    if (status >= 500) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.BadGateway,
        errorMessage: message,
      };
    }
    if (message?.includes('bot was blocked by the user')) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.BlockedBot,
        errorMessage: message,
      };
    }
    if (message?.includes('user is deactivated')) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.TelegramUserDeactivated,
        errorMessage: message,
      };
    }
    if (message?.includes("bot can't initiate conversation")) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.BotCantInitiateConversation,
        errorMessage: message,
      };
    }
    if (message?.includes('chat not found')) {
      return {
        status: NotificationStatus.Rejected,
        errorReason: NotificationErrorReason.ChatNotFound,
        errorMessage: message,
      };
    }
    return {
      status: NotificationStatus.Rejected,
      errorReason: NotificationErrorReason.ProviderRejected,
      errorMessage: message,
    };
  }

  private invalidMessage(): NotificationProviderSendResult {
    return {
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.UnsupportedChannel,
      errorMessage: 'Telegram Bot accepts only bot-channel messages.',
    };
  }

  private configurationError(message: string): NotificationProviderSendResult {
    return {
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.ProviderConfiguration,
      errorMessage: message,
    };
  }
}

type TelegramResponse = { ok?: boolean; description?: string };

function toTelegramOptions(input: NotificationProviderSendInput): Record<string, unknown> {
  if (input.message.kind !== 'bot') {
    return {};
  }
  return {
    disable_notification: input.extra?.disableNotification,
    link_preview_options: input.extra?.disableWebPagePreview ? { is_disabled: true } : undefined,
    reply_markup: input.message.buttons ? { inline_keyboard: toTelegramButtons(input.message.buttons) } : undefined,
  };
}

function toTelegramButtons(rows: NotificationMessageButton[][]): Record<string, unknown>[][] {
  return rows.map((row) =>
    row.map((button) => {
      if (button.callback) return { text: button.text, callback_data: button.callback };
      if (button.webApp) return { text: button.text, web_app: { url: button.webApp } };
      if (button.url) return { text: button.text, url: button.url };
      if (button.switchInlineQuery) return { text: button.text, switch_inline_query: button.switchInlineQuery };
      return { text: button.text, callback_data: 'noop' };
    }),
  );
}

function toSafeErrorMessage(error: unknown): string {
  // Fetch errors may include their request URL, which embeds the Telegram bot
  // token. Keep network diagnostics useful without ever placing credentials in
  // logs or persisted delivery errors.
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}
