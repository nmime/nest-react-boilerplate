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

const TelegramDefaultApiBase = 'https://api.telegram.org';

@Injectable()
export class TelegramBotNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.TelegramBot;
  private readonly logger = new Logger(TelegramBotNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  private apiBase(): string {
    return this.config.telegramApiBase ?? TelegramDefaultApiBase;
  }

  override readiness() {
    return { provider: this.provider, configured: Boolean(this.config.botToken) };
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'bot') {
      return this.invalidMessage();
    }
    const token = this.config.botToken;
    if (!token) {
      return this.configurationError('BOT_TOKEN is required for Telegram notification delivery.');
    }
    const invalidMessage = validateTelegramMessage(input.message);
    if (invalidMessage) {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.InvalidMessage,
        errorMessage: invalidMessage,
      };
    }

    const method = input.message.image ? 'sendPhoto' : 'sendMessage';
    const payload = input.message.image
      ? {
          chat_id: input.address,
          photo: input.message.image,
          caption: input.message.text,
          ...toTelegramOptions(input, false),
        }
      : { chat_id: input.address, text: input.message.text, ...toTelegramOptions(input, true) };

    await this.beginDispatch(input);
    try {
      const response = await fetch(`${this.apiBase()}/bot${token}/${method}`, {
        method: 'POST',
        signal: input.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as TelegramResponse;
      if (response.ok && result.ok !== false) {
        return { status: NotificationStatus.Sent };
      }
      return this.mapError(response.status, result.description, result.parameters?.retry_after);
    } catch (error) {
      this.logger.warn(`Telegram notification request failed: ${toSafeErrorMessage(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: toSafeErrorMessage(error),
      };
    }
  }

  private mapError(
    status: number,
    description: string | undefined,
    retryAfterSeconds?: number,
  ): NotificationProviderSendResult {
    const message = description?.slice(0, 500);
    if (status === 429) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.RateLimit,
        errorMessage: message,
        retryAfterSeconds,
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

type TelegramResponse = { ok?: boolean; description?: string; parameters?: { retry_after?: number } };

function toTelegramOptions(input: NotificationProviderSendInput, includeLinkPreview: boolean): Record<string, unknown> {
  if (input.message.kind !== 'bot') {
    return {};
  }
  const linkPreviewOptions =
    includeLinkPreview &&
    (input.extra?.disableWebPagePreview !== undefined || input.extra?.linkPreviewUrl !== undefined)
      ? {
          is_disabled: input.extra.disableWebPagePreview ?? false,
          url: input.extra.linkPreviewUrl,
        }
      : undefined;
  return {
    parse_mode: 'HTML',
    disable_notification: input.extra?.disableNotification,
    link_preview_options: linkPreviewOptions,
    reply_markup: input.message.buttons ? { inline_keyboard: toTelegramButtons(input.message.buttons) } : undefined,
  };
}

function toTelegramButtons(rows: NotificationMessageButton[][]): Record<string, unknown>[][] {
  return rows.map((row) =>
    row.map((button) => {
      const base = {
        text: button.text,
        ...(button.iconCustomEmojiId ? { icon_custom_emoji_id: button.iconCustomEmojiId } : {}),
      };
      if (button.callback) {
        return { ...base, callback_data: button.callback };
      }
      if (button.webApp) {
        return { ...base, web_app: { url: button.webApp } };
      }
      if (button.url) {
        return { ...base, url: button.url };
      }
      if (button.switchInlineQuery !== undefined) {
        return { ...base, switch_inline_query: button.switchInlineQuery };
      }
      throw new Error('Telegram button passed validation without an action.');
    }),
  );
}

function validateTelegramMessage(
  message: Extract<NotificationProviderSendInput['message'], { kind: 'bot' }> & {
    kind: 'bot';
  },
): string | undefined {
  const maximumTextLength = message.image ? 1024 : 4096;
  if (!message.text || message.text.length > maximumTextLength) {
    return `Telegram message text must contain 1 to ${maximumTextLength} characters.`;
  }
  if ((message.buttons?.length ?? 0) > 100) {
    return 'Telegram inline keyboards must not exceed 100 rows.';
  }
  for (const row of message.buttons ?? []) {
    if (row.length === 0 || row.length > 8) {
      return 'Telegram inline keyboard rows must contain 1 to 8 buttons.';
    }
    for (const button of row) {
      const error = validateTelegramButton(button);
      if (error) {
        return error;
      }
    }
  }
  return undefined;
}

function validateTelegramButton(button: NotificationMessageButton): string | undefined {
  const actions = [button.callback, button.webApp, button.url, button.switchInlineQuery].filter(
    (value) => value !== undefined,
  );
  if (actions.length !== 1) {
    return 'Every Telegram button must define exactly one action.';
  }
  if (!button.text.trim()) {
    return 'Telegram button text must not be empty.';
  }
  const hasEmptyAction =
    (button.callback !== undefined && !button.callback) ||
    (button.webApp !== undefined && !button.webApp) ||
    (button.url !== undefined && !button.url);
  if (hasEmptyAction) {
    return 'Telegram callback, web-app, and URL actions must not be empty.';
  }
  if (button.callback && Buffer.byteLength(button.callback, 'utf8') > 64) {
    return 'Telegram callback data must not exceed 64 bytes.';
  }
  return undefined;
}

function toSafeErrorMessage(error: unknown): string {
  // Fetch errors may include their request URL, which embeds the Telegram bot
  // token. Keep network diagnostics useful without ever placing credentials in
  // logs or persisted delivery errors.
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}
