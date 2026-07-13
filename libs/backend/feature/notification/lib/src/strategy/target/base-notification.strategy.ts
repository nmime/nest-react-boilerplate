import { Logger } from '@nestjs/common';
import {
  NotificationErrorReason,
  NotificationStatus,
  type NotificationEntity,
} from '@app/backend-postgres-main-notification';
import type { MessageStrategyResolver } from '../../messages';

export type BaseNotificationStrategy<T> = {
  readonly logger: Logger;
  handleNotification(params: {
    notification: NotificationEntity;
    channelStrategyResolver: unknown;
    messageStrategyResolver: MessageStrategyResolver;
  }): Promise<void>;
};

export function createBaseNotificationStrategy<T>(
  logger: Logger,
  handler: (params: {
    notification: NotificationEntity;
    channelStrategyResolver: unknown;
    messageStrategyResolver: MessageStrategyResolver;
  }) => Promise<void>,
): BaseNotificationStrategy<T> {
  return {
    logger,
    handleNotification: handler,
  };
}
