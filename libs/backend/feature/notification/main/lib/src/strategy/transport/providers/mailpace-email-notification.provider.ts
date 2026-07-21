import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryProvider, NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { NotificationConfigService } from '../../../config';
import {
  configurationError,
  mapProviderResponse,
  providerErrorMessage,
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
  private readonly logger = new Logger(MailPaceEmailNotificationProvider.name);

  constructor(private readonly config: NotificationConfigService) {
    super();
  }

  async send(input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    if (input.message.kind !== 'email') {
      return unsupportedChannel();
    }
    const { serverToken, from } = this.config.mailPace;
    if (!serverToken || !from) {
      return configurationError(
        'MAILPACE_SERVER_TOKEN and NOTIFICATION_EMAIL_FROM are required for MailPace delivery.',
      );
    }

    try {
      const response = await fetch('https://app.mailpace.com/api/v1/send', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'mailpace-server-token': serverToken,
          'user-agent': 'nest-react-boilerplate/notification-scheduler',
        },
        body: JSON.stringify({
          from,
          to: input.address,
          subject: input.message.subject,
          textbody: input.message.text,
        }),
      });
      if (response.ok) {
        return { status: NotificationStatus.Sent };
      }
      return mapProviderResponse(response.status, await providerErrorMessage(response));
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
