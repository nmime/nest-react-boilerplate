// @requirements REQ-AUTH-PERSISTENCE-007
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { Logger } from '@nestjs/common';
import { AuthTokenCleanupService, resolveAuthTokenCleanupConfig } from './auth-token-cleanup.service';
import type { AuthTokenRepository } from './infrastructure/data-access/repositories';

function createRepositoryMock(): {
  cleanupExpiredTokens: ReturnType<typeof vi.fn>;
  repository: AuthTokenRepository;
} {
  const cleanupExpiredTokens = vi.fn(() => okAsync({ userTokensDeleted: 0 }));

  return {
    cleanupExpiredTokens,
    repository: { cleanupExpiredTokens } as unknown as AuthTokenRepository,
  };
}

describe('AuthTokenCleanupService', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cleans up expired tokens through the repository', async () => {
    const { cleanupExpiredTokens, repository } = createRepositoryMock();
    const cleanup = new AuthTokenCleanupService(repository);
    const now = new Date('2026-06-01T00:00:00.000Z');

    await expect(cleanup.runCleanup(now)).resolves.toBe(true);

    expect(cleanupExpiredTokens).toHaveBeenCalledWith(now);
  });

  it('reports failure and logs when the repository cleanup errors', async () => {
    const cleanupExpiredTokens = vi.fn(() => errAsync({ code: 'repository_error', message: 'cleanup failed' }));
    const repository = {
      cleanupExpiredTokens,
    } as unknown as AuthTokenRepository;
    const cleanup = new AuthTokenCleanupService(repository);

    await expect(cleanup.runCleanup()).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('Auth token cleanup failed: cleanup failed');
  });

  it('logs deletion counts when tokens are removed', async () => {
    const cleanupExpiredTokens = vi.fn(() => okAsync({ userTokensDeleted: 3 }));
    const repository = {
      cleanupExpiredTokens,
    } as unknown as AuthTokenRepository;
    const cleanup = new AuthTokenCleanupService(repository);

    await expect(cleanup.runCleanup()).resolves.toBe(true);
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });

  it('logs and skips scheduling when cleanup is disabled', () => {
    const previousEnabled = process.env.AUTH_TOKEN_CLEANUP_ENABLED;
    process.env.AUTH_TOKEN_CLEANUP_ENABLED = 'false';
    const { cleanupExpiredTokens, repository } = createRepositoryMock();
    const cleanup = new AuthTokenCleanupService(repository);

    cleanup.onModuleInit();
    cleanup.onModuleDestroy();

    expect(cleanupExpiredTokens).not.toHaveBeenCalled();
    restoreEnv('AUTH_TOKEN_CLEANUP_ENABLED', previousEnabled);
  });

  it('runs an immediate cleanup on startup when configured', () => {
    vi.useFakeTimers();
    const previousEnabled = process.env.AUTH_TOKEN_CLEANUP_ENABLED;
    const previousInterval = process.env.AUTH_TOKEN_CLEANUP_INTERVAL_MS;
    const previousRunOnStart = process.env.AUTH_TOKEN_CLEANUP_RUN_ON_START;
    process.env.AUTH_TOKEN_CLEANUP_ENABLED = 'true';
    process.env.AUTH_TOKEN_CLEANUP_INTERVAL_MS = '60000';
    process.env.AUTH_TOKEN_CLEANUP_RUN_ON_START = 'true';
    const { cleanupExpiredTokens, repository } = createRepositoryMock();
    const cleanup = new AuthTokenCleanupService(repository);

    cleanup.onModuleInit();
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
    cleanup.onModuleDestroy();

    vi.useRealTimers();
    restoreEnv('AUTH_TOKEN_CLEANUP_ENABLED', previousEnabled);
    restoreEnv('AUTH_TOKEN_CLEANUP_INTERVAL_MS', previousInterval);
    restoreEnv('AUTH_TOKEN_CLEANUP_RUN_ON_START', previousRunOnStart);
  });

  it('does not overlap cleanup runs', async () => {
    const cleanupExpiredTokens = vi.fn(() => new Promise(() => undefined));
    const repository = {
      cleanupExpiredTokens,
    } as unknown as AuthTokenRepository;
    const cleanup = new AuthTokenCleanupService(repository);

    void cleanup.runCleanup();
    await expect(cleanup.runCleanup()).resolves.toBe(false);

    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });

  it('schedules and clears interval based on environment config', () => {
    vi.useFakeTimers();
    const previousEnabled = process.env.AUTH_TOKEN_CLEANUP_ENABLED;
    const previousInterval = process.env.AUTH_TOKEN_CLEANUP_INTERVAL_MS;
    const previousRunOnStart = process.env.AUTH_TOKEN_CLEANUP_RUN_ON_START;
    process.env.AUTH_TOKEN_CLEANUP_ENABLED = 'true';
    process.env.AUTH_TOKEN_CLEANUP_INTERVAL_MS = '60000';
    process.env.AUTH_TOKEN_CLEANUP_RUN_ON_START = 'false';
    const { cleanupExpiredTokens, repository } = createRepositoryMock();
    const cleanup = new AuthTokenCleanupService(repository);

    cleanup.onModuleInit();
    vi.advanceTimersByTime(59_999);
    expect(cleanupExpiredTokens).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);
    cleanup.onModuleDestroy();
    vi.advanceTimersByTime(60_000);
    expect(cleanupExpiredTokens).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    restoreEnv('AUTH_TOKEN_CLEANUP_ENABLED', previousEnabled);
    restoreEnv('AUTH_TOKEN_CLEANUP_INTERVAL_MS', previousInterval);
    restoreEnv('AUTH_TOKEN_CLEANUP_RUN_ON_START', previousRunOnStart);
  });
});

describe('resolveAuthTokenCleanupConfig', () => {
  it('defaults to enabled hourly cleanup on startup', () => {
    expect(resolveAuthTokenCleanupConfig({})).toEqual({
      enabled: true,
      intervalMs: 3_600_000,
      runOnStart: true,
    });
  });

  it('parses boolean and interval overrides', () => {
    expect(
      resolveAuthTokenCleanupConfig({
        AUTH_TOKEN_CLEANUP_ENABLED: 'off',
        AUTH_TOKEN_CLEANUP_INTERVAL_MS: '60000',
        AUTH_TOKEN_CLEANUP_RUN_ON_START: 'no',
      }),
    ).toEqual({ enabled: false, intervalMs: 60_000, runOnStart: false });
  });

  it('clamps unsafe intervals and ignores invalid interval values', () => {
    expect(
      resolveAuthTokenCleanupConfig({
        AUTH_TOKEN_CLEANUP_INTERVAL_MS: '1',
      }).intervalMs,
    ).toBe(60_000);

    expect(
      resolveAuthTokenCleanupConfig({
        AUTH_TOKEN_CLEANUP_INTERVAL_MS: '60000ms',
      }).intervalMs,
    ).toBe(3_600_000);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
