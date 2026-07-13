import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationErrorReason,
  NotificationStatus,
  type NotificationExtra,
  type NotificationMessageButton,
} from '@app/backend-postgres-main-notification';

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

  async send(params: {
    telegramId: string;
    message: MassSenderMessage;
    extra?: NotificationExtra | null;
  }): Promise<ChannelSendResult> {
    const { telegramId, message, extra } = params;

    try {
      this.logger.debug(`Sending notification to ${telegramId}: ${message.text.substring(0, 100)}${message.image ? ' [with image]' : ''}`);

      if (message.image) {
        this.logger.debug(`Photo message with caption to ${telegramId}`);
      }
      if (message.buttons) {
        this.logger.debug(`Message has ${message.buttons.length} row(s) of buttons`);
      }
      if (extra?.disableNotification) {
        this.logger.debug(`Silent notification for ${telegramId}`);
      }

      return { status: NotificationStatus.Sent };
    } catch (e) {
      return this.mapTelegramError(e);
    }
  }

  private mapTelegramError(e: unknown): ChannelSendResult {
    const error = e as { response?: { error_code?: number; description?: string }; message?: string };
    const errorDescription = String(error?.response?.description ?? error?.message ?? '');

    if (errorDescription.includes('Forbidden: bot was blocked by the user')) {
      return { errorReason: NotificationErrorReason.BlockedBot, status: NotificationStatus.Rejected };
    }
    if (errorDescription.includes('Forbidden: user is deactivated')) {
      return { errorReason: NotificationErrorReason.TelegramUserDeactivated, status: NotificationStatus.Rejected };
    }
    if (errorDescription.includes("Forbidden: bot can't initiate conversation with a user")) {
      return { errorReason: NotificationErrorReason.BotCantInitiateConversation, status: NotificationStatus.Rejected };
    }
    if (errorDescription.includes('Bad Request: chat not found')) {
      return { errorReason: NotificationErrorReason.ChatNotFound, status: NotificationStatus.Rejected };
    }
    if (errorDescription.includes('request to') && errorDescription.includes('failed')) {
      this.logger.warn(`Network error on sending notification, will retry: ${errorDescription}`);
      return { status: NotificationStatus.Pending, errorReason: NotificationErrorReason.NetworkError, errorMessage: errorDescription };
    }
    if (errorDescription.includes('Too Many Requests')) {
      this.logger.warn(`Rate limit error on sending notification, will retry: ${errorDescription}`);
      return { status: NotificationStatus.Pending, errorReason: NotificationErrorReason.RateLimit, errorMessage: errorDescription };
    }

    this.logger.error('Unknown error on sending notification', e);
    return { errorReason: NotificationErrorReason.UnknownError, errorMessage: e instanceof Error ? e.message : String(e), status: NotificationStatus.Error };
  }
}
