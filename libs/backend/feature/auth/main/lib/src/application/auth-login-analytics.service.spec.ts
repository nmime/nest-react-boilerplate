import { afterEach, describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { AuthLoginEventRecord, AuthLoginEventRepositoryPort } from '@app/backend-feature-auth-shared';
import { AuthLoginAnalyticsService } from './auth-login-analytics.service';
import type { GeoIpResolverService } from './geo-ip-resolver.service';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('AuthLoginAnalyticsService', () => {
  it('enriches and persists request evidence, then runs bounded retention', async () => {
    process.env.SESSION_SECRET = 'unit-test-session-secret';
    process.env.AUTH_LOGIN_NETWORK_RETENTION_DAYS = '7';
    process.env.AUTH_LOGIN_EVENT_RETENTION_DAYS = '90';
    const entity = {
      id: 'event-id',
      tenantId: '00000000-0000-0000-0000-000000000000',
      userId: null,
      identifierHash: null,
      sessionId: null,
      eventType: 'login',
      outcome: 'success',
      provider: 'telegram',
      channel: 'telegram_tma',
      failureCode: null,
      ipAddress: null,
      ipHash: null,
      countryCode: null,
      region: null,
      city: null,
      timezone: null,
      timezoneSource: null,
      language: null,
      languageSource: null,
      userAgent: null,
      requestId: null,
      occurredAt: new Date(),
      networkAnonymizedAt: null,
    } satisfies AuthLoginEventRecord;
    const repository = {
      record: vi.fn(() => okAsync(entity)),
      applyRetention: vi.fn(() => Promise.resolve({ anonymized: 0, deleted: 0 })),
    } as unknown as AuthLoginEventRepositoryPort;
    const geoIp = {
      resolve: vi.fn(() => Promise.resolve({ countryCode: 'UZ', city: 'Tashkent', timezone: 'Asia/Tashkent' })),
    } as unknown as GeoIpResolverService;
    const service = new AuthLoginAnalyticsService(geoIp, repository);

    await service.record({
      request: {
        ip: '203.0.113.10',
        headers: {
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'x-client-timezone': 'Europe/Berlin',
          'user-agent': 'Browser/1.0',
        },
      },
      tenantId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      identifier: 'User@Example.com',
      eventType: 'login',
      outcome: 'success',
      provider: 'telegram',
      channel: 'telegram_tma',
      language: 'en_US',
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: 'UZ',
        city: 'Tashkent',
        timezone: 'Europe/Berlin',
        timezoneSource: 'client',
        language: 'en',
        languageSource: 'user',
        ipAddress: '203.0.113.10',
        userAgent: 'Browser/1.0',
        identifierHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        ipHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(repository.applyRetention).toHaveBeenCalledOnce();

    await service.record({ request: {}, eventType: 'login', outcome: 'failure', provider: '', channel: '' });
    expect(repository.applyRetention).toHaveBeenCalledOnce();
  });

  it('uses request language and GeoIP timezone fallbacks and does not throw on storage failure', async () => {
    const repository = {
      record: vi.fn(() => errAsync({ code: 'repository_error' as const, message: 'offline' })),
      applyRetention: vi.fn(),
    } as unknown as AuthLoginEventRepositoryPort;
    const geoIp = {
      resolve: vi.fn(() => Promise.resolve({ timezone: 'Asia/Tashkent' })),
    } as unknown as GeoIpResolverService;
    const service = new AuthLoginAnalyticsService(geoIp, repository);
    const mappedAddress = `::ffff:${[198, 51, 100, 8].join('.')}`;
    await expect(
      service.record({
        request: { socket: { remoteAddress: mappedAddress }, headers: { 'accept-language': 'ru' } },
        eventType: 'login',
        outcome: 'failure',
        provider: 'password',
        channel: 'password',
        failureCode: 'rejected',
      }),
    ).resolves.toBeUndefined();
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: 'Asia/Tashkent',
        timezoneSource: 'geoip',
        language: 'ru',
        languageSource: 'request',
        ipAddress: '198.51.100.8',
      }),
    );
    expect(repository.applyRetention).not.toHaveBeenCalled();
  });

  it('is a no-op for memory persistence mode', async () => {
    const geoIp = { resolve: vi.fn() } as unknown as GeoIpResolverService;
    await new AuthLoginAnalyticsService(geoIp).record({
      request: {},
      eventType: 'login',
      outcome: 'success',
      provider: 'password',
      channel: 'password',
    });
    expect(geoIp.resolve).not.toHaveBeenCalled();
  });
});
