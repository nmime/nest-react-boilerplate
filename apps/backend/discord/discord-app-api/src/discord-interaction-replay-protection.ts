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

const completedTtlMs = 10 * 60 * 1000;
const processingTtlMs = 30 * 1000;
const redisOperationTimeoutMs = 1_000;
const completedValue = 'completed';

export interface DiscordInteractionReservation {
  key: string;
  ownerValue: string;
}

@Injectable()
export class DiscordInteractionReplayProtection {
  private readonly logger = new Logger(DiscordInteractionReplayProtection.name);

  constructor(
    @InjectRedis() private readonly redis: RedisClientLike,
    @Optional() redisConfig?: RedisConfigService,
  ) {
    if (process.env['NODE_ENV'] === 'production' && !redisConfig?.connectionConfig) {
      throw new Error('Discord replay protection requires Redis in production.');
    }
  }

  async reserve(interactionId: string): Promise<DiscordInteractionReservation> {
    if (!/^\d{1,32}$/u.test(interactionId)) {
      throw new BadRequestException('discord_interaction_id_invalid');
    }

    const reservation = {
      key: `social-ingress:discord:${interactionId}`,
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
      if (existing !== null) {
        throw new UnauthorizedException('discord_interaction_replayed');
      }
    }

    throw new ServiceUnavailableException('discord_replay_protection_unavailable');
  }

  async complete(reservation: DiscordInteractionReservation): Promise<void> {
    const redis = this.redis as Partial<RedisOwnedValueClient>;
    if (!redis.replaceIfValue) {
      throw new ServiceUnavailableException('discord_replay_protection_unavailable');
    }
    const completed = await this.operation(
      redis.replaceIfValue(reservation.key, reservation.ownerValue, completedValue, completedTtlMs),
    );
    if (!completed) {
      throw new ServiceUnavailableException('discord_replay_reservation_lost');
    }
  }

  async release(reservation: DiscordInteractionReservation): Promise<void> {
    try {
      await withTimeout(this.redis.deleteIfValue(reservation.key, reservation.ownerValue), redisOperationTimeoutMs);
    } catch {
      this.logger.warn('Discord replay reservation cleanup failed; the processing lease will expire.');
    }
  }

  private async operation<T>(operation: Promise<T>): Promise<T> {
    try {
      return await withTimeout(operation, redisOperationTimeoutMs);
    } catch (error) {
      throw new ServiceUnavailableException('discord_replay_protection_unavailable', { cause: error });
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
          reject(new Error('Discord replay storage operation timed out.'));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
