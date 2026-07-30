import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';

@Injectable()
export class ResendEmailNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.Resend;
  override readonly idempotentRetries = true;
  private readonly logger = new Logger(ResendEmailNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  override readiness() {
    const { apiKey, from } = this.config.resend;
    return { provider: this.provider, configured: Boolean(apiKey && from) };
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'email') {
      return unsupportedChannel();
    }
    const { apiKey, from } = this.config.resend;
    if (!apiKey || !from) {
      return configurationError('RESEND_API_KEY and NOTIFICATION_EMAIL_FROM are required for Resend delivery.');
    }

    const body = JSON.stringify({
      from,
      to: [input.address],
      subject: input.message.subject,
      text: input.message.text,
      ...(input.message.html ? { html: input.message.html } : {}),
      ...(input.message.attachments?.length
        ? {
            attachments: input.message.attachments.map((attachment) => ({
              filename: attachment.filename ?? attachment.cid,
              ...(isHttpsUrl(attachment.source) ? { path: attachment.source } : { content: attachment.source }),
              ...(attachment.cid ? { content_id: attachment.cid } : {}),
            })),
          }
        : {}),
    });
    await this.beginDispatch(input);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: input.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': `notification-${input.deliveryId}`,
          'user-agent': 'nest-react-boilerplate/notification-scheduler',
        },
        body,
      });
      if (response.ok) {
        return { status: NotificationStatus.Sent };
      }
      return mapProviderResponse(response.status, await providerErrorMessage(response), retryAfterSeconds(response));
    } catch (error) {
      this.logger.warn(`Resend notification request failed: ${toSafeErrorMessage(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: toSafeErrorMessage(error),
      };
    }
  }
}

export function configurationError(message: string): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.ProviderConfiguration,
    errorMessage: message,
  };
}

export function unsupportedChannel(): NotificationProviderSendResult {
  return {
    status: NotificationStatus.Error,
    errorReason: NotificationErrorReason.UnsupportedChannel,
    errorMessage: 'Email provider accepts only email-channel messages.',
  };
}

export function mapProviderResponse(
  status: number,
  message: string | undefined,
  retryAfter?: number,
): NotificationProviderSendResult {
  if (status === 429) {
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.RateLimit,
      errorMessage: message,
      retryAfterSeconds: retryAfter,
    };
  }
  if (status >= 500) {
    return {
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.BadGateway,
      errorMessage: message,
    };
  }
  return {
    status: NotificationStatus.Rejected,
    errorReason: NotificationErrorReason.ProviderRejected,
    errorMessage: message,
  };
}

export function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function providerErrorMessage(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => ({}))) as { message?: unknown; name?: unknown };
  let value: string | undefined;
  if (typeof body.message === 'string') {
    value = body.message;
  } else if (typeof body.name === 'string') {
    value = body.name;
  }
  return value?.slice(0, 500);
}

export function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: request failed` : 'Network request failed.';
}
