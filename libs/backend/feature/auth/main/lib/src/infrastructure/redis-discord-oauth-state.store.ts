import { Inject, Injectable } from '@nestjs/common';
import { RedisInjectToken, type RedisClientLike } from '@app/backend-common-redis';
import type { StoredDiscordState } from '../application/type/external-auth-internal.type';
import type { DiscordOauthStateStore } from './type/discord-oauth-state-store.type';

const DiscordOauthStatePrefix = 'auth:discord-oauth-state:';

@Injectable()
export class RedisDiscordOauthStateStore implements DiscordOauthStateStore {
  constructor(@Inject(RedisInjectToken) private readonly redis: RedisClientLike) {}

  async store(state: StoredDiscordState, ttlSeconds: number): Promise<void> {
    await this.redis.setex(
      `${DiscordOauthStatePrefix}${state.stateHash}`,
      ttlSeconds,
      JSON.stringify({ ...state, expiresAt: state.expiresAt.toISOString() }),
    );
  }

  async consume(stateHash: string): Promise<StoredDiscordState | null> {
    const key = `${DiscordOauthStatePrefix}${stateHash}`;
    const serialized = await this.redis.get(key);
    if (!serialized || !(await this.redis.deleteIfValue(key, serialized))) {
      return null;
    }
    try {
      const parsed = JSON.parse(serialized) as Omit<StoredDiscordState, 'expiresAt'> & { expiresAt: string };
      const expiresAt = new Date(parsed.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return null;
      }
      return { ...parsed, expiresAt };
    } catch {
      return null;
    }
  }
}
