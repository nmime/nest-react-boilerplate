import { randomInt } from "node:crypto";
import type { RedisLockAcquireOptions } from "../type";

export function getRetryDelay(options: RedisLockAcquireOptions): number {
  const delayMs = options.retryDelayMs ?? 100;
  const jitterMs = options.retryJitterMs ?? 50;
  return delayMs + randomInt(Math.max(Math.trunc(jitterMs), 0) + 1);
}
