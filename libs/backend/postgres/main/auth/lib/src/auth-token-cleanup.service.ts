import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { resolveAuthTokenCleanupConfig } from './factory/auth-token-cleanup-config.factory';
import { AuthTokenRepository } from './infrastructure/data-access/repositories';
import type { CleanupInterval } from './type/auth-token-cleanup-internal.type';
import { unrefTimer } from './util/timer.util';

const AuthTokenCleanupShutdownTimeoutMs = 5_000;

export * from './factory/auth-token-cleanup-config.factory';
export * from './type/auth-token-cleanup.type';

@Injectable()
export class AuthTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthTokenCleanupService.name);
  private readonly config = resolveAuthTokenCleanupConfig();
  private interval: CleanupInterval | undefined;
  private activeCleanup: Promise<boolean> | undefined;

  constructor(
    @Inject(AuthTokenRepository)
    private readonly repository: AuthTokenRepository,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('Auth token cleanup job is disabled.');
      return;
    }

    if (this.config.runOnStart) {
      void this.runCleanup();
    }

    this.interval = setInterval(() => {
      void this.runCleanup();
    }, this.config.intervalMs);
    unrefTimer(this.interval);

    this.logger.log(`Auth token cleanup job scheduled every ${this.config.intervalMs}ms.`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    const activeCleanup = this.activeCleanup;
    if (!activeCleanup) {
      return;
    }

    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timed-out'>((resolve) => {
      timeout = setTimeout(() => {
        resolve('timed-out');
      }, AuthTokenCleanupShutdownTimeoutMs);
    });
    try {
      const result = await Promise.race([activeCleanup.then(() => 'complete' as const), timedOut]);
      if (result === 'timed-out') {
        this.logger.warn(
          `Auth token cleanup did not finish within ${AuthTokenCleanupShutdownTimeoutMs}ms; shutdown will continue.`,
        );
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  runCleanup(now: Date = new Date()): Promise<boolean> {
    if (this.activeCleanup) {
      this.logger.debug('Skipping auth token cleanup because a run is active.');
      return Promise.resolve(false);
    }

    const cleanup = this.executeCleanup(now);
    this.activeCleanup = cleanup;
    return cleanup.finally(() => {
      if (this.activeCleanup === cleanup) {
        this.activeCleanup = undefined;
      }
    });
  }

  private async executeCleanup(now: Date): Promise<boolean> {
    const result = await this.repository.cleanupExpiredTokens(now);
    if (result.isErr()) {
      this.logger.warn(`Auth token cleanup failed: ${result.error.message}`);
      return false;
    }

    if (result.value.userTokensDeleted > 0) {
      this.logger.log(`Auth token cleanup deleted ${result.value.userTokensDeleted} expired user action tokens.`);
    }
    return true;
  }
}
