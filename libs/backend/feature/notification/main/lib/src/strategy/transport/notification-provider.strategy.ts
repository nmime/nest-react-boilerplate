import type {
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationExtra,
  NotificationMessageButton,
  NotificationEmailAttachment,
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
  html?: string;
  attachments?: NotificationEmailAttachment[];
}

export interface PushNotificationMessage {
  kind: 'push';
  subject?: string;
  text: string;
  image?: string;
  actions?: NotificationMessageButton[];
}

export type NotificationRenderedMessage = BotNotificationMessage | EmailNotificationMessage | PushNotificationMessage;

export interface NotificationProviderSendInput {
  address: string;
  message: NotificationRenderedMessage;
  extra?: NotificationExtra | null;
  /** Stable queue id used by providers that support idempotency keys. */
  deliveryId: string;
  /** Scheduler-owned deadline signal. Providers must pass it to external I/O. */
  signal?: AbortSignal;
  /** Persist the attempt immediately before the provider can accept the message. */
  markDispatchStarted: () => Promise<void>;
}

export interface NotificationProviderSendResult {
  status: NotificationStatus;
  errorReason?: NotificationErrorReason;
  errorMessage?: string;
  retryAfterSeconds?: number;
}

export interface NotificationProviderReadiness {
  provider: NotificationDeliveryProvider;
  configured: boolean;
}

/**
 * A transport owns one external provider. Channel rendering and target lookup
 * happen before this boundary; implementations must never switch providers.
 */
export abstract class NotificationProviderStrategy {
  abstract readonly provider: NotificationDeliveryProvider;
  readonly idempotentRetries: boolean = false;

  readiness(): NotificationProviderReadiness {
    return { provider: this.provider, configured: false };
  }

  protected async beginDispatch(input: NotificationProviderSendInput): Promise<void> {
    input.signal?.throwIfAborted();
    await input.markDispatchStarted();
    input.signal?.throwIfAborted();
  }

  abstract send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult>;
}
