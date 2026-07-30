import { Injectable } from '@nestjs/common';
import { NotificationDeliveryProvider } from '@app/common-notifications';
import {
  DiscordBotNotificationProvider,
  MailPaceEmailNotificationProvider,
  ResendEmailNotificationProvider,
  TelegramBotNotificationProvider,
  GoogleFcmNotificationProvider,
  AppleApnsNotificationProvider,
} from './providers';
import type { NotificationProviderReadiness, NotificationProviderStrategy } from './notification-provider.strategy';

@Injectable()
export class NotificationProviderResolver {
  private readonly providers: ReadonlyMap<NotificationDeliveryProvider, NotificationProviderStrategy>;

  constructor(
    telegram: TelegramBotNotificationProvider,
    discord: DiscordBotNotificationProvider,
    resend: ResendEmailNotificationProvider,
    mailPace: MailPaceEmailNotificationProvider,
    googleFcm: GoogleFcmNotificationProvider,
    appleApns: AppleApnsNotificationProvider,
  ) {
    this.providers = new Map<NotificationDeliveryProvider, NotificationProviderStrategy>([
      [telegram.provider, telegram],
      [discord.provider, discord],
      [resend.provider, resend],
      [mailPace.provider, mailPace],
      [googleFcm.provider, googleFcm],
      [appleApns.provider, appleApns],
    ]);
  }

  resolve(provider: NotificationDeliveryProvider): NotificationProviderStrategy | undefined {
    return this.providers.get(provider);
  }

  supportsIdempotentRetry(provider: NotificationDeliveryProvider): boolean {
    return this.resolve(provider)?.idempotentRetries === true;
  }

  readiness(): NotificationProviderReadiness[] {
    return Object.values(NotificationDeliveryProvider).map((provider) => {
      const strategy = this.resolve(provider);
      return strategy?.readiness() ?? { provider, configured: false };
    });
  }
}
