import { Injectable } from '@nestjs/common';
import { InjectRedis } from './decorator';
import type { RedisClientLike } from './type';

export interface RateLimitHitInput {
  key: string;
  windowSeconds: number;
  limit: number;
}

export interface RateLimitHitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

export interface SharedRateLimiter {
  hit(params: RateLimitHitInput): Promise<RateLimitHitResult>;
}

export const SharedRateLimiterInjectToken = Symbol('SharedRateLimiterInjectToken');

@Injectable()
export class RedisRateLimitService implements SharedRateLimiter {
  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async hit(params: RateLimitHitInput): Promise<RateLimitHitResult> {
    // Atomic INCR + PEXPIRE-if-no-TTL: the counter can never be observed
    // without an expiry, so a dropped connection between separate INCR and
    // EXPIRE round-trips can no longer leave a key that never resets.
    const { count } = await this.redis.incrementWithWindow(params.key, params.windowSeconds * 1000);

    return {
      allowed: count <= params.limit,
      count,
      remaining: Math.max(params.limit - count, 0),
    };
  }
}

export function buildRateLimitKey(parts: {
  scope: string;
  tenantId?: string | null;
  subject?: string | null;
  action: string;
}): string {
  const tenant = sanitizeRateLimitKeyPart(parts.tenantId || 'global');
  const subject = sanitizeRateLimitKeyPart(parts.subject || 'anonymous');
  return `rate-limit:${sanitizeRateLimitKeyPart(parts.scope)}:${tenant}:${subject}:${sanitizeRateLimitKeyPart(parts.action)}`;
}

function sanitizeRateLimitKeyPart(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      // Strip the ':' field delimiter too: leaving it inside a part would shift
      // key boundaries and let distinct (scope,tenant,subject,action) tuples
      // collapse onto one shared counter.
      .replace(/[^a-z0-9._-]/gu, '_')
  );
}
