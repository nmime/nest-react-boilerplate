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

  get telegramApiBase(): string | undefined {
    return this.configService.get<string>('TELEGRAM_API_BASE');
  }

  get discordApiBase(): string | undefined {
    return this.configService.get<string>('DISCORD_API_BASE');
  }

  get resend(): { apiKey: string; from: string; apiBase: string | undefined } {
    return {
      apiKey: this.configService.get<string>('RESEND_API_KEY', ''),
      from: this.configService.get<string>('NOTIFICATION_EMAIL_FROM', ''),
      apiBase: this.configService.get<string>('RESEND_API_BASE'),
    };
  }

  get mailPace(): { serverToken: string; from: string; apiBase: string | undefined } {
    return {
      serverToken: this.configService.get<string>('MAILPACE_SERVER_TOKEN', ''),
      from: this.configService.get<string>('NOTIFICATION_EMAIL_FROM', ''),
      apiBase: this.configService.get<string>('MAILPACE_API_BASE'),
    };
  }

  get googleFcm(): {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    tokenUri: string;
  } {
    return {
      projectId: this.configService.get<string>('NOTIFICATION_FCM_PROJECT_ID', ''),
      clientEmail: this.configService.get<string>('NOTIFICATION_FCM_CLIENT_EMAIL', ''),
      privateKey: normalizePrivateKey(this.configService.get<string>('NOTIFICATION_FCM_PRIVATE_KEY', '')),
      tokenUri: this.configService.get<string>('NOTIFICATION_FCM_TOKEN_URI', 'https://oauth2.googleapis.com/token'),
    };
  }

  get appleApns(): {
    teamId: string;
    keyId: string;
    bundleId: string;
    privateKey: string;
    sandbox: boolean;
  } {
    return {
      teamId: this.configService.get<string>('NOTIFICATION_APNS_TEAM_ID', ''),
      keyId: this.configService.get<string>('NOTIFICATION_APNS_KEY_ID', ''),
      bundleId: this.configService.get<string>('NOTIFICATION_APNS_BUNDLE_ID', ''),
      privateKey: normalizePrivateKey(this.configService.get<string>('NOTIFICATION_APNS_PRIVATE_KEY', '')),
      sandbox: this.configService.get<boolean>('NOTIFICATION_APNS_SANDBOX', false),
    };
  }

  get emailProvider(): NotificationDeliveryProvider.Resend | NotificationDeliveryProvider.MailPace {
    const provider = this.configService.get<string>('NOTIFICATION_EMAIL_PROVIDER', 'resend').trim().toLowerCase();
    if (provider === 'mailpace') {
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

  get broadcasts(): {
    requireIndependentApproval: boolean;
    consumerIntervalMs: number;
    materializationChunkSize: number;
    csvMaxBytes: number;
    csvMaxRows: number;
  } {
    return {
      requireIndependentApproval: this.configService.get<boolean>(
        'NOTIFICATION_BROADCAST_REQUIRE_INDEPENDENT_APPROVAL',
        false,
      ),
      consumerIntervalMs: this.configService.get<number>('NOTIFICATION_CONSUMER_INTERVAL_MS', 1000),
      materializationChunkSize: this.configService.get<number>('NOTIFICATION_MATERIALIZATION_CHUNK_SIZE', 500),
      csvMaxBytes: this.configService.get<number>('NOTIFICATION_CSV_MAX_BYTES', 10 * 1024 * 1024),
      csvMaxRows: this.configService.get<number>('NOTIFICATION_CSV_MAX_ROWS', 100_000),
    };
  }
}

function normalizePrivateKey(value: string): string {
  return value.replaceAll('\\n', '\n').trim();
}
