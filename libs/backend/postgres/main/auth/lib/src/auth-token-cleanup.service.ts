import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { resolveAuthTokenCleanupConfig } from './factory/auth-token-cleanup-config.factory';
import { AuthTokenRepository } from './infrastructure/data-access/repositories';
import type { CleanupInterval } from './type/auth-token-cleanup-internal.type';
import { unrefTimer } from './util/timer.util';

export * from './factory/auth-token-cleanup-config.factory';
export * from './type/auth-token-cleanup.type';

@Injectable()
export class AuthTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthTokenCleanupService.name);
  private readonly config = resolveAuthTokenCleanupConfig();
  private interval: CleanupInterval | undefined;
  private cleanupInProgress = false;

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

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async runCleanup(now: Date = new Date()): Promise<boolean> {
    if (this.cleanupInProgress) {
      this.logger.debug('Skipping auth token cleanup because a run is active.');
      return false;
    }

    this.cleanupInProgress = true;
    try {
      const result = await this.repository.cleanupExpiredTokens(now);
      if (result.isErr()) {
        this.logger.warn(`Auth token cleanup failed: ${result.error.message}`);
        return false;
      }

      const deleted = result.value.refreshTokensDeleted + result.value.userTokensDeleted;
      if (deleted > 0) {
        this.logger.log(
          `Auth token cleanup deleted ${result.value.refreshTokensDeleted} refresh tokens and ${result.value.userTokensDeleted} user action tokens.`,
        );
      }
      return true;
    } finally {
      this.cleanupInProgress = false;
    }
  }
}
