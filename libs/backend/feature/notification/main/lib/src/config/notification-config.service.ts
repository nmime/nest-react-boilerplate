import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationSendConfig {
  deliveriesPerIteration: number;
  requestsPerSecond: number;
  timeouts: { idleTimeout: number; afterMassSend: number };
}

@Injectable()
export class NotificationConfigService {
  constructor(private readonly configService: ConfigService) {}

  get botToken(): string {
    return this.configService.get<string>('BOT_TOKEN', '');
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
