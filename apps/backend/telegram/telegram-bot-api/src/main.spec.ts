// @requirements REQ-RUNTIME-LIFECYCLE-004
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bootstrapNestApi: vi.fn(() => Promise.resolve()),
  initializeCapabilities: vi.fn(),
  register: vi.fn(() => class TelegramBotApiRootModule {}),
  resolveDefaultDevelopmentCorsOrigins: vi.fn(() => ['http://localhost:4200']),
}));

vi.mock('./capabilities.bootstrap.generated', () => ({
  initializeCapabilities: mocks.initializeCapabilities,
}));
vi.mock('./bootstrap.runtime', () => ({
  bootstrapNestApi: mocks.bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins: mocks.resolveDefaultDevelopmentCorsOrigins,
}));
vi.mock('./telegram-bot-api.module', () => ({
  TelegramBotApiModule: { register: mocks.register },
}));

describe('telegram-bot-api entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('boots without Fastify cookie sessions or a durable session-store provider', async () => {
    await import('./main');

    await vi.waitFor(() => {
      expect(mocks.bootstrapNestApi).toHaveBeenCalledOnce();
    });
    expect(mocks.initializeCapabilities).toHaveBeenCalledWith('telegram-bot-api');
    expect(mocks.bootstrapNestApi).toHaveBeenCalledWith(expect.any(Function), {
      appName: 'telegram-bot-api',
      corsOrigins: ['http://localhost:4200'],
      enableCookieSessions: false,
      port: 3013,
    });
  });
});
