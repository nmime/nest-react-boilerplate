import { Injectable } from "@nestjs/common";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

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

export const SHARED_RATE_LIMITER = Symbol("SHARED_RATE_LIMITER");

@Injectable()
export class RedisRateLimitService implements SharedRateLimiter {
  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async hit(params: RateLimitHitInput): Promise<RateLimitHitResult> {
    const count = await this.redis.incr(params.key);
    if (count === 1) {
      await this.redis.expire(params.key, params.windowSeconds);
    }

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
  const tenant = sanitizeRateLimitKeyPart(parts.tenantId || "global");
  const subject = sanitizeRateLimitKeyPart(parts.subject || "anonymous");
  return `rate-limit:${sanitizeRateLimitKeyPart(parts.scope)}:${tenant}:${subject}:${sanitizeRateLimitKeyPart(parts.action)}`;
}

function sanitizeRateLimitKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/gu, "_");
}
