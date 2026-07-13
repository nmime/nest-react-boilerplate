import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NotificationHealthConfig {
  responsibleTag: string;
  alertIntervalMinutes: number;
  errorThreshold: number;
}

@Injectable()
export class NotificationHealthConfigService implements NotificationHealthConfig {
  constructor(private readonly configService: ConfigService) {}

  get responsibleTag(): string {
    return this.configService.get<string>('NOTIFICATION_HEALTH_RESPONSIBLE_TAG', '') ?? '';
  }

  get alertIntervalMinutes(): number {
    return this.configService.get<number>('NOTIFICATION_HEALTH_ALERT_INTERVAL_MINUTES', 30) ?? 30;
  }

  get errorThreshold(): number {
    return this.configService.get<number>('NOTIFICATION_HEALTH_ERROR_THRESHOLD', 0) ?? 0;
  }
}
