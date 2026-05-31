import { Injectable } from "@nestjs/common";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

@Injectable()
export class RedisHealthIndicator {
  readonly name = "redis";

  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async check(): Promise<{
    name: string;
    status: "ok" | "error";
    details?: Record<string, unknown>;
  }> {
    try {
      await this.redis.ping();
      return { name: this.name, status: "ok" };
    } catch (error) {
      return {
        name: this.name,
        status: "error",
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
