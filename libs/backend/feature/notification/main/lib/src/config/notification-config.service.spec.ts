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

  it('reads broadcast and push-provider settings without exposing file paths to strategies', () => {
    const values = new Map<string, unknown>([
      ['NOTIFICATION_BROADCAST_REQUIRE_INDEPENDENT_APPROVAL', true],
      ['NOTIFICATION_CONSUMER_INTERVAL_MS', 2500],
      ['NOTIFICATION_MATERIALIZATION_CHUNK_SIZE', 750],
      ['NOTIFICATION_CSV_MAX_BYTES', 2048],
      ['NOTIFICATION_CSV_MAX_ROWS', 250],
      ['NOTIFICATION_FCM_PROJECT_ID', 'project'],
      ['NOTIFICATION_FCM_CLIENT_EMAIL', 'sender@example.test'],
      ['NOTIFICATION_FCM_PRIVATE_KEY', 'line-one\\nline-two'],
      ['NOTIFICATION_FCM_TOKEN_URI', 'https://oauth.example.test/token'],
      ['NOTIFICATION_APNS_TEAM_ID', 'TEAM'],
      ['NOTIFICATION_APNS_KEY_ID', 'KEY'],
      ['NOTIFICATION_APNS_BUNDLE_ID', 'com.example.app'],
      ['NOTIFICATION_APNS_PRIVATE_KEY', 'apns-one\\napns-two'],
      ['NOTIFICATION_APNS_SANDBOX', true],
    ]);
    const get = vi.fn((key: string, fallback: unknown) => values.get(key) ?? fallback);
    const config = new NotificationConfigService({ get } as never);

    expect(config.broadcasts).toEqual({
      requireIndependentApproval: true,
      consumerIntervalMs: 2500,
      materializationChunkSize: 750,
      csvMaxBytes: 2048,
      csvMaxRows: 250,
    });
    expect(config.googleFcm).toEqual({
      projectId: 'project',
      clientEmail: 'sender@example.test',
      privateKey: 'line-one\nline-two',
      tokenUri: 'https://oauth.example.test/token',
    });
    expect(config.appleApns).toEqual({
      teamId: 'TEAM',
      keyId: 'KEY',
      bundleId: 'com.example.app',
      privateKey: 'apns-one\napns-two',
      sandbox: true,
    });
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
    expect(schedulerConfig.broadcasts).toEqual({
      requireIndependentApproval: false,
      consumerIntervalMs: 1000,
      materializationChunkSize: 500,
      csvMaxBytes: 10 * 1024 * 1024,
      csvMaxRows: 100_000,
    });
    expect(schedulerConfig.googleFcm).toEqual({
      projectId: '',
      clientEmail: '',
      privateKey: '',
      tokenUri: 'https://oauth2.googleapis.com/token',
    });
    expect(schedulerConfig.appleApns).toEqual({
      teamId: '',
      keyId: '',
      bundleId: '',
      privateKey: '',
      sandbox: false,
    });
    expect(healthConfig.responsibleTag).toBe('');
    expect(healthConfig.alertIntervalMinutes).toBe(30);
    expect(healthConfig.errorThreshold).toBe(0);
  });
});
