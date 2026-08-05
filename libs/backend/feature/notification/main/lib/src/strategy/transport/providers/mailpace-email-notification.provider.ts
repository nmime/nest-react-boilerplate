import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  configurationError,
  mapProviderResponse,
  providerErrorMessage,
  retryAfterSeconds,
  toSafeErrorMessage,
  unsupportedChannel,
} from './resend-email-notification.provider';
import {
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
  NotificationProviderStrategy,
} from '../notification-provider.strategy';

@Injectable()
export class MailPaceEmailNotificationProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.MailPace;
  override readonly idempotentRetries = true;
  private readonly logger = new Logger(MailPaceEmailNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  override readiness() {
    const { serverToken, from } = this.config.mailPace;
    return { provider: this.provider, configured: Boolean(serverToken && from) };
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'email') {
      return unsupportedChannel();
    }
    const { serverToken, from, apiBase } = this.config.mailPace;
    if (!serverToken || !from) {
      return configurationError(
        'MAILPACE_SERVER_TOKEN and NOTIFICATION_EMAIL_FROM are required for MailPace delivery.',
      );
    }
    if (input.message.attachments?.some((attachment) => /^https:\/\//u.test(attachment.source))) {
      return {
        status: NotificationStatus.Error,
        errorReason: NotificationErrorReason.InvalidMessage,
        errorMessage: 'MailPace attachments require base64 content, not a remote URL.',
      };
    }

    const body = JSON.stringify({
      from,
      to: input.address,
      subject: input.message.subject,
      textbody: input.message.text,
      ...(input.message.html ? { htmlbody: input.message.html } : {}),
      ...(input.message.attachments?.length
        ? {
            attachments: input.message.attachments.map((attachment) => {
              return {
                name: attachment.filename ?? attachment.cid,
                content: attachment.source,
                content_type: attachment.contentType ?? 'application/octet-stream',
                ...(attachment.inline ? { cid: `<${attachment.cid}>` } : {}),
              };
            }),
          }
        : {}),
    });
    await this.beginDispatch(input);
    try {
      const response = await fetch(`${apiBase ?? 'https://app.mailpace.com'}/api/v1/send`, {
        method: 'POST',
        signal: input.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'mailpace-server-token': serverToken,
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
      this.logger.warn(`MailPace notification request failed: ${toSafeErrorMessage(error)}`);
      return {
        status: NotificationStatus.Pending,
        errorReason: NotificationErrorReason.NetworkError,
        errorMessage: toSafeErrorMessage(error),
      };
    }
  }
}
