import type { Logger } from '@nestjs/common';
import { defaultLocale } from '@app/backend-common-i18n';
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
  signal: AbortSignal;
  beforeProviderDispatch: () => Promise<void>;
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
    claimToken: params.pending.claimToken,
    status: NotificationStatus.Error,
    error: { reason, message },
  });

  params.signal.throwIfAborted();
  const recipient = await params.recipientResolver.resolve(notification.targetType, notification.targetId, delivery);
  params.signal.throwIfAborted();
  if (!recipient) {
    logger.warn(`Notification recipient not found for ${notification.targetType}/${notification.targetId}`);
    return fail(NotificationErrorReason.IncorrectTarget);
  }

  const messageStrategy = params.messageStrategyResolver.resolve(notification, delivery.channel);
  const message = messageStrategy.getMessage(notification.extra?.useLanguage ?? recipient.language ?? defaultLocale);
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
    signal: params.signal,
    markDispatchStarted: params.beforeProviderDispatch,
  });
  return {
    id: delivery.id,
    createdAt: delivery.createdAt,
    claimToken: params.pending.claimToken,
    status: sendResult.status,
    error: sendResult.errorReason ? { reason: sendResult.errorReason, message: sendResult.errorMessage } : null,
    retryAfterSeconds: sendResult.retryAfterSeconds,
  };
}
