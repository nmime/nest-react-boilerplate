import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationErrorReason,
  NotificationStatus,
  type NotificationEntity,
} from '@app/backend-postgres-main-notification';
import type { ChannelStrategyResolver } from '../transport';
import type { MessageStrategyResolver } from '../../messages';

export interface TelegramChatTarget {
  telegramId: string;
  status?: string;
}

@Injectable()
export class TelegramChatNotificationStrategy {
  private readonly logger = new Logger(TelegramChatNotificationStrategy.name);

  async handleNotification(params: {
    notification: NotificationEntity;
    channelStrategyResolver: ChannelStrategyResolver;
    messageStrategyResolver: MessageStrategyResolver;
  }): Promise<void> {
    const { notification, channelStrategyResolver: resolver, messageStrategyResolver } = params;

    const language = notification.extra?.useLanguage ?? 'en';

    const messageStrategy = messageStrategyResolver.resolve(notification);
    if (!messageStrategy) {
      this.logger.error(`Not found message strategy for notification: ${notification.id ?? ''}`);
      notification.status = NotificationStatus.Error;
      notification.error = { reason: NotificationErrorReason.NotFoundMessageStrategy };
      return;
    }

    const message = messageStrategy.getMessage(language);
    if (!message) {
      this.logger.error(`Not found message for notification #${notification.id ?? ''}`);
      notification.status = NotificationStatus.Error;
      notification.error = { reason: NotificationErrorReason.NotFoundMessage };
      return;
    }

    const channelStrategy = resolver.resolve(NotificationChannel.Bot);
    if (!channelStrategy) {
      this.logger.error(`Bot channel strategy not resolved: ${notification.id ?? ''}`);
      notification.status = NotificationStatus.Error;
      notification.error = { reason: NotificationErrorReason.UnknownError };
      return;
    }

    const telegramId = notification.targetId;
    const sendResult = await channelStrategy.send({ telegramId, message, extra: notification.extra });

    notification.status = sendResult.status;
    if (sendResult.errorReason) {
      notification.error = { reason: sendResult.errorReason, message: sendResult.errorMessage };
    }
  }
}
