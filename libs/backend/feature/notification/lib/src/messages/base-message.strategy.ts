import type { NotificationEntity } from '@app/backend-postgres-main-notification';
import type { MassSenderMessage } from '../strategy/transport';

export abstract class BaseMessageStrategy {
  abstract getMessage(
    langCode: string | undefined,
    notification: NotificationEntity,
  ): MassSenderMessage | undefined;
}
