import { Injectable, Optional } from '@nestjs/common';
import type { HealthIndicatorResult } from '@app/backend-common-health';
import { InjectRedis } from './decorator';
import type { RedisClientLike } from './type';

const defaultHealthTimeoutMs = 1_000;

@Injectable()
export class RedisHealthIndicator {
  readonly name = 'redis';

  constructor(
    @InjectRedis() private readonly redis: RedisClientLike,
    @Optional() private readonly timeoutMs = defaultHealthTimeoutMs,
  ) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      await withTimeout(this.redis.ping(), this.timeoutMs);
      return { name: this.name, status: 'ok' };
    } catch (error) {
      return {
        name: this.name,
        status: 'error',
        details: safeErrorDetails(error),
      };
    }
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout!: NodeJS.Timeout;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Redis health check timed out.'));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
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

const connectionCredentialPattern = new RegExp(
  ['([a-z][a-z0-9+.-]*://)', '([^\\s/@:]+)', ':', '([^\\s/@]+)', '@'].join(''),
  'giu',
);
const secretAssignmentPattern = /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^\s,;]+)/giu;

function redactDependencyDetail(value: string): string {
  return value.replace(connectionCredentialPattern, '$1[redacted]@').replace(secretAssignmentPattern, '$1=[redacted]');
}
