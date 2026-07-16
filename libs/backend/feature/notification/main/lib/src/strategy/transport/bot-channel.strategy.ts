import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { InlineKeyboardButton } from 'grammy/types';
import {
  NotificationErrorReason,
  NotificationStatus,
  type NotificationExtra,
  type NotificationMessageButton,
} from '@app/common-notifications';
import { TelegramBotInstanceInjectToken, type TelegramBotTransport } from '@app/backend-feature-telegram-shared';

export interface MassSenderMessage {
  image?: string;
  text: string;
  buttons?: NotificationMessageButton[][];
}

export interface ChannelSendResult {
  status: NotificationStatus;
  errorReason?: NotificationErrorReason;
  errorMessage?: string;
}

@Injectable()
export class BotChannelStrategy {
  private readonly logger = new Logger(BotChannelStrategy.name);

  constructor(
    @Optional()
    @Inject(TelegramBotInstanceInjectToken)
    private readonly telegram?: TelegramBotTransport,
  ) {}

  async send(params: {
    telegramId: string;
    message: MassSenderMessage;
    extra?: NotificationExtra | null;
  }): Promise<ChannelSendResult> {
    if (!this.telegram) {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.UnsupportedChannel,
        errorMessage: 'TelegramBotModule is not wired for this application.',
      };
    }

    const { telegramId, message, extra } = params;
    const options = {
      disable_notification: extra?.disableNotification,
      link_preview_options: extra?.disableWebPagePreview ? { is_disabled: true } : undefined,
      reply_markup: message.buttons ? { inline_keyboard: toTelegramButtons(message.buttons) } : undefined,
    };

    try {
      if (message.image) {
        await this.telegram.bot.api.sendPhoto(telegramId, message.image, {
          ...options,
          caption: message.text,
        });
      } else {
        await this.telegram.bot.api.sendMessage(telegramId, message.text, options);
      }
      return { status: NotificationStatus.Sent };
    } catch (error) {
      return this.mapTelegramError(error);
    }
  }

  private mapTelegramError(error: unknown): ChannelSendResult {
    const telegramError = error as { error_code?: number; description?: string; message?: string };
    const description = String(telegramError.description ?? telegramError.message ?? '');

    if (description.includes('Forbidden: bot was blocked by the user')) {
      return { errorReason: NotificationErrorReason.BlockedBot, status: NotificationStatus.Rejected };
    }
    if (description.includes('Forbidden: user is deactivated')) {
      return { errorReason: NotificationErrorReason.TelegramUserDeactivated, status: NotificationStatus.Rejected };
    }
    if (description.includes("Forbidden: bot can't initiate conversation with a user")) {
      return {
        errorReason: NotificationErrorReason.BotCantInitiateConversation,
        status: NotificationStatus.Rejected,
      };
    }
    if (description.includes('Bad Request: chat not found')) {
      return { errorReason: NotificationErrorReason.ChatNotFound, status: NotificationStatus.Rejected };
    }
    if (description.includes('Too Many Requests') || telegramError.error_code === 429) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.RateLimit,
        errorMessage: description,
      };
    }
    if (description.includes('request to') || description.includes('fetch failed')) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: description,
      };
    }
    if (telegramError.error_code === 502) {
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.BadGateway,
        errorMessage: description,
      };
    }

    this.logger.error('Telegram notification delivery failed', error);
    return {
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.UnknownError,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function toTelegramButtons(rows: NotificationMessageButton[][]): InlineKeyboardButton[][] {
  return rows.map((row) => row.map(toTelegramButton));
}

function toTelegramButton(button: NotificationMessageButton): InlineKeyboardButton {
  const emoji = button.iconCustomEmojiId ? { icon_custom_emoji_id: button.iconCustomEmojiId } : {};
  if (button.callback) {
    return { text: button.text, callback_data: button.callback, ...emoji };
  }
  if (button.webApp) {
    return { text: button.text, web_app: { url: button.webApp }, ...emoji };
  }
  if (button.url) {
    return { text: button.text, url: button.url, ...emoji };
  }
  if (button.switchInlineQuery) {
    return { text: button.text, switch_inline_query: button.switchInlineQuery, ...emoji };
  }
  return { text: button.text, callback_data: 'noop', ...emoji };
}
