import type {
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationExtra,
  NotificationMessageButton,
  NotificationStatus,
} from '@app/common-notifications';

export interface BotNotificationMessage {
  kind: 'bot';
  image?: string;
  text: string;
  buttons?: NotificationMessageButton[][];
}

export interface EmailNotificationMessage {
  kind: 'email';
  subject: string;
  text: string;
}

export type NotificationRenderedMessage = BotNotificationMessage | EmailNotificationMessage;

export interface NotificationProviderSendInput {
  address: string;
  message: NotificationRenderedMessage;
  extra?: NotificationExtra | null;
  /** Stable queue id used by providers that support idempotency keys. */
  deliveryId: string;
}

export interface NotificationProviderSendResult {
  status: NotificationStatus;
  errorReason?: NotificationErrorReason;
  errorMessage?: string;
}

/**
 * A transport owns one external provider. Channel rendering and target lookup
 * happen before this boundary; implementations must never switch providers.
 */
export abstract class NotificationProviderStrategy {
  abstract readonly provider: NotificationDeliveryProvider;

  abstract send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult>;
}
