import { Logger } from '@nestjs/common';
import type { NotificationEntity } from '@app/backend-postgres-main-notification';
import type { MessageStrategyResolver } from '../../messages';

export type BaseNotificationStrategy = {
  readonly logger: Logger;
  handleNotification(params: {
    notification: NotificationEntity;
    channelStrategyResolver: unknown;
    messageStrategyResolver: MessageStrategyResolver;
  }): Promise<void>;
};

export function createBaseNotificationStrategy(
  logger: Logger,
  handler: (params: {
    notification: NotificationEntity;
    channelStrategyResolver: unknown;
    messageStrategyResolver: MessageStrategyResolver;
  }) => Promise<void>,
): BaseNotificationStrategy {
  return {
    logger,
    handleNotification: handler,
  };
}
