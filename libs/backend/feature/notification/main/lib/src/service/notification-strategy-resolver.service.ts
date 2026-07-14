import { Injectable } from '@nestjs/common';
import { NotificationTargetType } from '@app/backend-postgres-main-notification';
import type { BaseNotificationStrategy } from '../strategy/target';

@Injectable()
export class NotificationStrategyResolverService {
  private readonly strategyMap = new Map<NotificationTargetType, BaseNotificationStrategy>();

  register(targetType: NotificationTargetType, strategy: BaseNotificationStrategy): void {
    this.strategyMap.set(targetType, strategy);
  }

  resolve(targetType: NotificationTargetType): BaseNotificationStrategy | undefined {
    return this.strategyMap.get(targetType);
  }
}
