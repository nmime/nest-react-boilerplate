import type { MassSenderMessage } from '../strategy/transport';

export abstract class BaseMessageStrategy {
  abstract getMessage(langCode: string | undefined): MassSenderMessage | undefined;
}
