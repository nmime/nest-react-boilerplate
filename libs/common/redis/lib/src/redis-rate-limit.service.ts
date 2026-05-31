import { Injectable } from "@nestjs/common";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

@Injectable()
export class RedisRateLimitService {
  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async hit(params: {
    key: string;
    windowSeconds: number;
    limit: number;
  }): Promise<{ allowed: boolean; count: number; remaining: number }> {
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
