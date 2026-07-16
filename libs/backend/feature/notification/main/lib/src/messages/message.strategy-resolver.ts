import { Injectable } from '@nestjs/common';
import type { NotificationDeliveryChannel, NotificationRecord } from '@app/common-notifications';
import { BaseMessageStrategy } from './base-message.strategy';
import { DefaultMessageStrategy } from './default-message.strategy';

@Injectable()
export class MessageStrategyResolver {
  resolve(notification: NotificationRecord, channel: NotificationDeliveryChannel): BaseMessageStrategy {
    return new DefaultMessageStrategy(notification, channel);
  }
}
