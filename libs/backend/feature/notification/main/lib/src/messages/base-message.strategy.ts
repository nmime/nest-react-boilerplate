import type { NotificationRenderedMessage } from '../strategy/transport';

export abstract class BaseMessageStrategy {
  abstract getMessage(langCode: string | undefined): NotificationRenderedMessage | undefined;
}
