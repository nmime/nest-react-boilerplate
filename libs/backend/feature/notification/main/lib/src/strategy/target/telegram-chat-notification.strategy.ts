import { Injectable, Logger } from '@nestjs/common';
import type { NotificationDeliveryResult } from '@app/common-notifications';
import {
  deliverNotification,
  type BaseNotificationStrategy,
  type HandleNotificationParams,
} from './base-notification.strategy';

@Injectable()
export class TelegramChatNotificationStrategy implements BaseNotificationStrategy {
  private readonly logger = new Logger(TelegramChatNotificationStrategy.name);

  handleNotification(params: HandleNotificationParams): Promise<NotificationDeliveryResult> {
    return deliverNotification(this.logger, params);
  }
}
