import { Injectable } from "@nestjs/common";
import type { HealthIndicatorResult } from "@app/common/health";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

@Injectable()
export class RedisHealthIndicator {
  readonly name = "redis";

  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { name: this.name, status: "ok" };
    } catch (error) {
      return {
        name: this.name,
        status: "error",
        details: safeErrorDetails(error),
      };
    }
  }
}

function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: redactDependencyDetail(error.message),
      type: error.name,
    };
  }

  return { message: redactDependencyDetail(String(error)) };
}

function redactDependencyDetail(value: string): string {
  return value
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/giu,
      "$1[redacted]@",
    )
    .replace(
      /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^\s,;]+)/giu,
      "$1=[redacted]",
    );
}
