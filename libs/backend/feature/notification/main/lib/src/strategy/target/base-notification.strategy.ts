import type { Logger } from '@nestjs/common';
import type { NotificationRecipientResolver } from '@app/backend-feature-notification-shared';
import {
  NotificationErrorReason,
  NotificationStatus,
  type NotificationDeliveryResult,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import type { MessageStrategyResolver } from '../../messages';
import type { ChannelStrategyResolver } from '../transport';

export interface HandleNotificationParams {
  pending: PendingNotificationDelivery;
  channelStrategyResolver: ChannelStrategyResolver;
  messageStrategyResolver: MessageStrategyResolver;
  recipientResolver: NotificationRecipientResolver;
}

export interface BaseNotificationStrategy {
  handleNotification(params: HandleNotificationParams): Promise<NotificationDeliveryResult>;
}

export async function deliverNotification(
  logger: Logger,
  params: HandleNotificationParams,
): Promise<NotificationDeliveryResult> {
  const { delivery, notification } = params.pending;
  const fail = (reason: NotificationErrorReason, message?: string): NotificationDeliveryResult => ({
    id: delivery.id,
    createdAt: delivery.createdAt,
    status: NotificationStatus.Error,
    error: { reason, message },
  });

  const recipient = await params.recipientResolver.resolve(
    notification.targetType,
    notification.targetId,
    delivery.channel,
  );
  if (!recipient) {
    logger.warn(`Notification recipient not found for ${notification.targetType}/${notification.targetId}`);
    return fail(NotificationErrorReason.IncorrectTarget);
  }

  const messageStrategy = params.messageStrategyResolver.resolve(notification, delivery.channel);
  const message = messageStrategy.getMessage(notification.extra?.useLanguage ?? recipient.language ?? 'en');
  if (!message) {
    return fail(NotificationErrorReason.NotFoundMessage);
  }

  const channelStrategy = params.channelStrategyResolver.resolve(delivery.channel);
  if (!channelStrategy) {
    return fail(NotificationErrorReason.UnsupportedChannel);
  }

  const sendResult = await channelStrategy.send({
    telegramId: recipient.address,
    message,
    extra: notification.extra,
  });
  return {
    id: delivery.id,
    createdAt: delivery.createdAt,
    status: sendResult.status,
    error: sendResult.errorReason ? { reason: sendResult.errorReason, message: sendResult.errorMessage } : null,
  };
}
