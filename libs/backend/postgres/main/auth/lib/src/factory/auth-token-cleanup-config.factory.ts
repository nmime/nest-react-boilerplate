import { DefaultCleanupIntervalMs, MinimumCleanupIntervalMs } from '../const/auth-token-cleanup.const';
import type { AuthTokenCleanupConfig } from '../type/auth-token-cleanup.type';
import { parseBoolean, parsePositiveInteger } from '../util/parse-env.util';

export function resolveAuthTokenCleanupConfig(env: NodeJS.ProcessEnv = process.env): AuthTokenCleanupConfig {
  return {
    enabled: parseBoolean(env.AUTH_TOKEN_CLEANUP_ENABLED, true),
    intervalMs: parsePositiveInteger(
      env.AUTH_TOKEN_CLEANUP_INTERVAL_MS,
      DefaultCleanupIntervalMs,
      MinimumCleanupIntervalMs,
    ),
    runOnStart: parseBoolean(env.AUTH_TOKEN_CLEANUP_RUN_ON_START, true),
  };
}
