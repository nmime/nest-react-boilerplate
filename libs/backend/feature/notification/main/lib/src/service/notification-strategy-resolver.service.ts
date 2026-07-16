import { Injectable } from '@nestjs/common';
import { NotificationTargetType } from '@app/common-notifications';
import {
  type BaseNotificationStrategy,
  TelegramChatNotificationStrategy,
  UserNotificationStrategy,
} from '../strategy/target';

@Injectable()
export class NotificationStrategyResolverService {
  private readonly strategyMap = new Map<NotificationTargetType, BaseNotificationStrategy>();

  constructor(userStrategy: UserNotificationStrategy, telegramChatStrategy: TelegramChatNotificationStrategy) {
    this.register(NotificationTargetType.User, userStrategy);
    this.register(NotificationTargetType.TelegramChat, telegramChatStrategy);
    this.register(NotificationTargetType.SystemTelegramChat, telegramChatStrategy);
  }

  register(targetType: NotificationTargetType, strategy: BaseNotificationStrategy): void {
    this.strategyMap.set(targetType, strategy);
  }

  resolve(targetType: NotificationTargetType): BaseNotificationStrategy | undefined {
    return this.strategyMap.get(targetType);
  }
}
