import { Injectable } from '@nestjs/common';
import type { NotificationEntity } from '@app/backend-postgres-main-notification';
import { BaseMessageStrategy } from './base-message.strategy';
import { DefaultMessageStrategy } from './default-message.strategy';

@Injectable()
export class MessageStrategyResolver {
  resolve(notification: NotificationEntity): BaseMessageStrategy | undefined {
    if (notification.template) {
      return new DefaultMessageStrategy(notification);
    }
    if (notification.customTemplate) {
      // Custom templates would map to specific strategy instances
      return undefined;
    }
    return undefined;
  }
}
