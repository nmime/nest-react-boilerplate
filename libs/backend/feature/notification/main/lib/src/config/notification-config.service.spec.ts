import { describe, expect, it, vi } from 'vitest';
import { NotificationConfigService } from './notification-config.service';
import { NotificationHealthConfigService } from './notification-health-config.service';

describe('notification configuration', () => {
  it('reads scheduler settings through the shared configuration service', () => {
    const values = new Map<string, unknown>([
      ['BOT_TOKEN', 'token'],
      ['NOTIFICATION_DELIVERIES_PER_ITERATION', 75],
      ['NOTIFICATION_REQUESTS_PER_SECOND', 20],
      ['NOTIFICATION_IDLE_TIMEOUT_MS', 5000],
      ['NOTIFICATION_AFTER_MASS_SEND_MS', 750],
      ['NOTIFICATION_DELIVERIES_PARTITION_AHEAD_MONTHS', 9],
    ]);
    const get = vi.fn((key: string, fallback: unknown) => values.get(key) ?? fallback);
    const config = new NotificationConfigService({ get } as never);

    expect(config.botToken).toBe('token');
    expect(config.send).toEqual({
      deliveriesPerIteration: 75,
      requestsPerSecond: 20,
      timeouts: { idleTimeout: 5000, afterMassSend: 750 },
    });
    expect(config.deliveriesPartitionAheadMonths).toBe(9);
  });

  it('reads health-check ownership and thresholds', () => {
    const values = new Map<string, unknown>([
      ['NOTIFICATION_HEALTH_RESPONSIBLE_TAG', '@platform'],
      ['NOTIFICATION_HEALTH_ALERT_INTERVAL_MINUTES', 15],
      ['NOTIFICATION_HEALTH_ERROR_THRESHOLD', 3],
    ]);
    const get = vi.fn((key: string, fallback: unknown) => values.get(key) ?? fallback);
    const config = new NotificationHealthConfigService({ get } as never);

    expect(config.responsibleTag).toBe('@platform');
    expect(config.alertIntervalMinutes).toBe(15);
    expect(config.errorThreshold).toBe(3);
  });

  it('keeps safe standalone defaults when notification settings are absent', () => {
    const get = vi.fn((_key: string, fallback: unknown) => fallback);
    const schedulerConfig = new NotificationConfigService({ get } as never);
    const healthConfig = new NotificationHealthConfigService({ get } as never);

    expect(schedulerConfig.botToken).toBe('');
    expect(schedulerConfig.send).toEqual({
      deliveriesPerIteration: 50,
      requestsPerSecond: 30,
      timeouts: { idleTimeout: 10000, afterMassSend: 1000 },
    });
    expect(schedulerConfig.deliveriesPartitionAheadMonths).toBe(6);
    expect(healthConfig.responsibleTag).toBe('');
    expect(healthConfig.alertIntervalMinutes).toBe(30);
    expect(healthConfig.errorThreshold).toBe(0);
  });
});
