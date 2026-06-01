import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { AuthTokenRepository } from "./repository";

export interface AuthTokenCleanupConfig {
  enabled: boolean;
  intervalMs: number;
  runOnStart: boolean;
}

const DefaultCleanupIntervalMs = 60 * 60 * 1000;
type CleanupInterval = ReturnType<typeof setInterval>;

@Injectable()
export class AuthTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthTokenCleanupService.name);
  private readonly config = resolveAuthTokenCleanupConfig();
  private interval: CleanupInterval | undefined;
  private cleanupInProgress = false;

  constructor(private readonly repository: AuthTokenRepository) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log("Auth token cleanup job is disabled.");
      return;
    }

    if (this.config.runOnStart) {
      void this.runCleanup();
    }

    this.interval = setInterval(() => {
      void this.runCleanup();
    }, this.config.intervalMs);
    this.interval.unref?.();

    this.logger.log(
      `Auth token cleanup job scheduled every ${this.config.intervalMs}ms.`,
    );
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async runCleanup(now: Date = new Date()): Promise<boolean> {
    if (this.cleanupInProgress) {
      this.logger.debug("Skipping auth token cleanup because a run is active.");
      return false;
    }

    this.cleanupInProgress = true;
    try {
      const result = await this.repository.cleanupExpiredTokens(now);
      if (result.isErr()) {
        this.logger.warn(
          `Auth token cleanup failed: ${result.error.message}`,
        );
        return false;
      }

      const deleted =
        result.value.refreshTokensDeleted + result.value.userTokensDeleted;
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

export function resolveAuthTokenCleanupConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthTokenCleanupConfig {
  return {
    enabled: parseBoolean(env.AUTH_TOKEN_CLEANUP_ENABLED, true),
    intervalMs: parsePositiveInteger(
      env.AUTH_TOKEN_CLEANUP_INTERVAL_MS,
      DefaultCleanupIntervalMs,
    ),
    runOnStart: parseBoolean(env.AUTH_TOKEN_CLEANUP_RUN_ON_START, true),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
