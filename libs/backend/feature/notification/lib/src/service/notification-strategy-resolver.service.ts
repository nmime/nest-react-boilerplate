import { Injectable } from '@nestjs/common';
import { NotificationTargetType } from '@app/backend-postgres-main-notification';
import type { BaseNotificationStrategy } from '../strategy/target';

@Injectable()
export class NotificationStrategyResolverService {
  private readonly strategyMap = new Map<NotificationTargetType, BaseNotificationStrategy<unknown>>();

  register(targetType: NotificationTargetType, strategy: BaseNotificationStrategy<unknown>): void {
    this.strategyMap.set(targetType, strategy);
  }

  resolve(targetType: NotificationTargetType): BaseNotificationStrategy<unknown> | undefined {
    return this.strategyMap.get(targetType);
  }
}
