import type { Logger } from '@nestjs/common';
import type { NotificationRecipientResolver } from '@app/backend-feature-notification-shared';
import {
  NotificationErrorReason,
  NotificationStatus,
  type NotificationDeliveryResult,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import type { MessageStrategyResolver } from '../../messages';
import type { NotificationProviderResolver } from '../transport';

export interface HandleNotificationParams {
  pending: PendingNotificationDelivery;
  notificationProviderResolver: NotificationProviderResolver;
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

  const recipient = await params.recipientResolver.resolve(notification.targetType, notification.targetId, delivery);
  if (!recipient) {
    logger.warn(`Notification recipient not found for ${notification.targetType}/${notification.targetId}`);
    return fail(NotificationErrorReason.IncorrectTarget);
  }

  const messageStrategy = params.messageStrategyResolver.resolve(notification, delivery.channel);
  const message = messageStrategy.getMessage(notification.extra?.useLanguage ?? recipient.language ?? 'en');
  if (!message) {
    return fail(NotificationErrorReason.NotFoundMessage);
  }

  const provider = params.notificationProviderResolver.resolve(delivery.provider);
  if (!provider) {
    return fail(NotificationErrorReason.UnsupportedChannel);
  }

  const sendResult = await provider.send({
    address: recipient.address,
    message,
    extra: notification.extra,
    deliveryId: delivery.id,
  });
  return {
    id: delivery.id,
    createdAt: delivery.createdAt,
    status: sendResult.status,
    error: sendResult.errorReason ? { reason: sendResult.errorReason, message: sendResult.errorMessage } : null,
  };
}
