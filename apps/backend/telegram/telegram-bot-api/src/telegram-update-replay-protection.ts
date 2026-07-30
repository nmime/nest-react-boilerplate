import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  InjectRedis,
  RedisConfigService,
  type RedisClientLike,
  type RedisOwnedValueClient,
} from '@app/backend-common-redis';

const completedTtlMs = 7 * 24 * 60 * 60 * 1000;
const processingTtlMs = 5 * 60 * 1000;
const redisOperationTimeoutMs = 1_000;
const completedValue = 'completed';

export interface TelegramUpdateReservation {
  key: string;
  ownerValue: string;
}

@Injectable()
export class TelegramUpdateReplayProtection {
  private readonly logger = new Logger(TelegramUpdateReplayProtection.name);

  constructor(
    @InjectRedis() private readonly redis: RedisClientLike,
    @Optional() redisConfig?: RedisConfigService,
  ) {
    if (process.env['NODE_ENV'] === 'production' && !redisConfig?.connectionConfig) {
      throw new Error('Telegram replay protection requires Redis in production.');
    }
  }

  async reserve(update: unknown): Promise<TelegramUpdateReservation | null> {
    const updateId = updateIdFrom(update);
    const reservation = {
      key: `social-ingress:telegram:${updateId}`,
      ownerValue: `processing:${randomUUID()}`,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // A release can race the failed NX reservation, so retry once when the key disappears.
      // eslint-disable-next-line no-await-in-loop
      const reserved = await this.operation(
        this.redis.set(reservation.key, reservation.ownerValue, 'PX', processingTtlMs, 'NX'),
      );
      if (reserved === 'OK') {
        return reservation;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await this.operation(this.redis.get(reservation.key));
      if (existing === completedValue) {
        return null;
      }
      if (existing !== null) {
        throw new UnauthorizedException('telegram_update_replayed');
      }
    }

    throw new ServiceUnavailableException('telegram_replay_protection_unavailable');
  }

  async complete(reservation: TelegramUpdateReservation): Promise<void> {
    const redis = this.redis as Partial<RedisOwnedValueClient>;
    if (!redis.replaceIfValue) {
      throw new ServiceUnavailableException('telegram_replay_protection_unavailable');
    }
    const completed = await this.operation(
      redis.replaceIfValue(reservation.key, reservation.ownerValue, completedValue, completedTtlMs),
    );
    if (!completed) {
      throw new ServiceUnavailableException('telegram_replay_reservation_lost');
    }
  }

  async release(reservation: TelegramUpdateReservation): Promise<void> {
    try {
      await withTimeout(this.redis.deleteIfValue(reservation.key, reservation.ownerValue), redisOperationTimeoutMs);
    } catch {
      this.logger.warn('Telegram replay reservation cleanup failed; the processing lease will expire.');
    }
  }

  private async operation<T>(operation: Promise<T>): Promise<T> {
    try {
      return await withTimeout(operation, redisOperationTimeoutMs);
    } catch (error) {
      throw new ServiceUnavailableException('telegram_replay_protection_unavailable', { cause: error });
    }
  }
}

function updateIdFrom(update: unknown): number {
  if (
    !update ||
    typeof update !== 'object' ||
    !('update_id' in update) ||
    !Number.isSafeInteger(update.update_id) ||
    Number(update.update_id) < 0
  ) {
    throw new BadRequestException('telegram_update_id_invalid');
  }
  return Number(update.update_id);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout!: NodeJS.Timeout;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Telegram replay storage operation timed out.'));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
