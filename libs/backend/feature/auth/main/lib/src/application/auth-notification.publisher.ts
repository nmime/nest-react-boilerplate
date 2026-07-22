import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { NotificationService } from '@app/backend-feature-notification-shared';
import {
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationTargetType,
  type NotificationTemplateChannelContent,
} from '@app/common-notifications';
import type { AuthUserTokenPurpose } from '../infrastructure';

type AuthAction = Extract<AuthUserTokenPurpose, 'email_verification' | 'password_reset'>;

const actionTemplateCode: Record<AuthAction, string> = {
  email_verification: 'auth.email-verification-code',
  // This is a public template identifier, not a credential.
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords
  password_reset: 'auth.password-reset-code',
};

/** Publishes all account-recovery credentials through the durable notification feature. */
@Injectable()
export class AuthNotificationPublisher {
  constructor(@Optional() private readonly notifications?: NotificationService) {}

  async publishUserAction(params: { userId: string; purpose: AuthAction; token: string }): Promise<void> {
    const notifications = this.requireNotifications();
    const route = configuredAuthRoute();
    const templateCode = actionTemplateCode[params.purpose];
    await notifications.upsertTemplate({
      code: templateCode,
      description: `Authentication ${params.purpose.replaceAll('_', ' ')} code.`,
      channels: codeTemplateChannels(params.purpose),
    });
    await notifications.createTemplateNotification({
      targetType: NotificationTargetType.User,
      targetId: params.userId,
      templateCode,
      deliveries: [route],
      inAppVisible: false,
      sensitiveData: { code: params.token },
    });
  }

  private requireNotifications(): NotificationService {
    if (!this.notifications) {
      throw new ServiceUnavailableException(
        'Notification capability is required to deliver verification and password-reset credentials.',
      );
    }
    return this.notifications;
  }
}

function configuredAuthRoute(): {
  channel: NotificationChannel.Bot | NotificationChannel.Email;
  provider: NotificationDeliveryProvider;
} {
  const configured = (process.env.AUTH_NOTIFICATION_PROVIDER ?? process.env.NOTIFICATION_EMAIL_PROVIDER ?? 'resend')
    .trim()
    .toLowerCase();
  switch (configured) {
    case 'telegram-bot':
      return { channel: NotificationChannel.Bot, provider: NotificationDeliveryProvider.TelegramBot };
    case 'discord-bot':
      return { channel: NotificationChannel.Bot, provider: NotificationDeliveryProvider.DiscordBot };
    case 'resend':
      return { channel: NotificationChannel.Email, provider: NotificationDeliveryProvider.Resend };
    case 'mailpace':
      return { channel: NotificationChannel.Email, provider: NotificationDeliveryProvider.MailPace };
    default:
      throw new ServiceUnavailableException(
        'AUTH_NOTIFICATION_PROVIDER must be telegram-bot, discord-bot, resend, or mailpace.',
      );
  }
}

function codeTemplateChannels(purpose: AuthAction): Array<{
  channel: NotificationChannel;
  content: NotificationTemplateChannelContent;
}> {
  const isReset = purpose === 'password_reset';
  const action = isReset ? 'password reset' : 'email verification';
  const subject = isReset ? 'Reset your password' : 'Verify your email address';
  return [
    {
      channel: NotificationChannel.Bot,
      content: {
        body: {
          en: `Your ${action} code is {code}. Do not share this code with anyone.`,
          ru: `Ваш код для ${isReset ? 'сброса пароля' : 'подтверждения email'}: {code}. Никому не сообщайте этот код.`,
        },
      },
    },
    {
      channel: NotificationChannel.Email,
      content: {
        subject: { en: subject, ru: isReset ? 'Сброс пароля' : 'Подтвердите email' },
        body: {
          en: `Your ${action} code is {code}. Do not share this code with anyone.`,
          ru: `Ваш код для ${isReset ? 'сброса пароля' : 'подтверждения email'}: {code}. Никому не сообщайте этот код.`,
        },
      },
    },
  ];
}
