// @requirements REQ-NOTIFY-DELIVERY-001
import { NotificationDeliveryProvider, NotificationStatus } from '@app/common-notifications';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppleApnsNotificationProvider,
  DiscordBotNotificationProvider,
  GoogleFcmNotificationProvider,
  MailPaceEmailNotificationProvider,
  ResendEmailNotificationProvider,
  TelegramBotNotificationProvider,
} from './providers';
import { NotificationProviderResolver } from './notification-provider-resolver';
import {
  NotificationProviderStrategy,
  type NotificationProviderSendInput,
  type NotificationProviderSendResult,
} from './notification-provider.strategy';

describe(NotificationProviderResolver.name, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports readiness through every concrete provider adapter without contacting a live provider', () => {
    const resolver = resolverWithConfig(configuredProviderValues());

    expect(resolver.readiness()).toEqual(
      Object.values(NotificationDeliveryProvider).map((provider) => ({ provider, configured: true })),
    );
  });

  it('dispatches through the resolved concrete adapter boundary using a local transport double', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const resolver = resolverWithConfig(configuredProviderValues());

    await expect(
      resolver.resolve(NotificationDeliveryProvider.Resend)?.send({
        address: 'recipient@example.test',
        deliveryId: 'readiness-1',
        markDispatchStarted: vi.fn().mockResolvedValue(undefined),
        message: { kind: 'email', subject: 'Readiness', text: 'Probe' },
      }),
    ).resolves.toEqual({ status: NotificationStatus.Sent });
    expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }));
  });

  it('reports an adapter as unconfigured without making an external request', () => {
    const config = configuredProviderValues();
    config.discordBotToken = '';

    const readiness = resolverWithConfig(config).readiness();

    expect(readiness).toContainEqual({ provider: NotificationDeliveryProvider.DiscordBot, configured: false });
  });

  it('exposes provider retry idempotency without changing provider selection', () => {
    const resolver = resolverWithConfig(configuredProviderValues());

    expect(resolver.supportsIdempotentRetry(NotificationDeliveryProvider.Resend)).toBe(true);
    expect(resolver.supportsIdempotentRetry(NotificationDeliveryProvider.TelegramBot)).toBe(false);
  });

  it('defaults an adapter without readiness configuration to unconfigured', () => {
    expect(new DefaultReadinessProvider().readiness()).toEqual({
      provider: NotificationDeliveryProvider.TelegramBot,
      configured: false,
    });
  });
});

class DefaultReadinessProvider extends NotificationProviderStrategy {
  readonly provider = NotificationDeliveryProvider.TelegramBot;

  async send(_input: NotificationProviderSendInput): Promise<NotificationProviderSendResult> {
    return { status: NotificationStatus.Sent };
  }
}

function resolverWithConfig(config: ReturnType<typeof configuredProviderValues>): NotificationProviderResolver {
  return new NotificationProviderResolver(
    new TelegramBotNotificationProvider(config as never),
    new DiscordBotNotificationProvider(config as never),
    new ResendEmailNotificationProvider(config as never),
    new MailPaceEmailNotificationProvider(config as never),
    new GoogleFcmNotificationProvider(config as never),
    new AppleApnsNotificationProvider(config as never),
  );
}

function configuredProviderValues() {
  return {
    botToken: 'test-telegram-token',
    discordBotToken: 'test-discord-token',
    resend: { apiKey: 'test-resend-key', from: 'Sender <sender@example.test>' },
    mailPace: { serverToken: 'test-mailpace-token', from: 'Sender <sender@example.test>' },
    googleFcm: {
      projectId: 'test-project',
      clientEmail: 'sender@example.test',
      privateKey: 'test-private-key',
      tokenUri: 'https://oauth.example.test/token',
    },
    appleApns: {
      teamId: 'TESTTEAM',
      keyId: 'TESTKEY',
      bundleId: 'test.example.app',
      privateKey: 'test-private-key',
      sandbox: true,
    },
  };
}
