import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationDeliveryProvider } from '@app/common-notifications';

export interface NotificationSendConfig {
  deliveriesPerIteration: number;
  requestsPerSecond: number;
  timeouts: { idleTimeout: number; afterMassSend: number };
}

@Injectable()
export class NotificationConfigService {
  constructor(private readonly configService: ConfigService) {}

  get botToken(): string {
    return this.configService.get<string>('BOT_TOKEN', this.configService.get<string>('TELEGRAM_BOT_TOKEN', ''));
  }

  get discordBotToken(): string {
    return this.configService.get<string>('DISCORD_BOT_TOKEN', '');
  }

  get resend(): { apiKey: string; from: string } {
    return {
      apiKey: this.configService.get<string>('RESEND_API_KEY', ''),
      from: this.configService.get<string>('NOTIFICATION_EMAIL_FROM', ''),
    };
  }

  get mailPace(): { serverToken: string; from: string } {
    return {
      serverToken: this.configService.get<string>('MAILPACE_SERVER_TOKEN', ''),
      from: this.configService.get<string>('NOTIFICATION_EMAIL_FROM', ''),
    };
  }

  get emailProvider(): NotificationDeliveryProvider.Resend | NotificationDeliveryProvider.MailPace {
    const provider = this.configService.get<string>('NOTIFICATION_EMAIL_PROVIDER', 'resend').trim().toLowerCase();
    if (provider === NotificationDeliveryProvider.MailPace) {
      return NotificationDeliveryProvider.MailPace;
    }
    return NotificationDeliveryProvider.Resend;
  }

  get send(): NotificationSendConfig {
    return {
      deliveriesPerIteration: this.configService.get<number>('NOTIFICATION_DELIVERIES_PER_ITERATION', 50),
      requestsPerSecond: this.configService.get<number>('NOTIFICATION_REQUESTS_PER_SECOND', 30),
      timeouts: {
        idleTimeout: this.configService.get<number>('NOTIFICATION_IDLE_TIMEOUT_MS', 10000),
        afterMassSend: this.configService.get<number>('NOTIFICATION_AFTER_MASS_SEND_MS', 1000),
      },
    };
  }

  get deliveriesPartitionAheadMonths(): number {
    return this.configService.get<number>('NOTIFICATION_DELIVERIES_PARTITION_AHEAD_MONTHS', 6);
  }
}
