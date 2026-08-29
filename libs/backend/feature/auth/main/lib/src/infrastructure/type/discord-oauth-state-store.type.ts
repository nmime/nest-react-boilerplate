import type { StoredDiscordState } from '../../application/type/external-auth-internal.type';

/**
 * One-time storage for Discord OAuth authorization state. Implementations must
 * remove a state when it is consumed so callback replay is rejected.
 */
export interface DiscordOauthStateStore {
  consume(stateHash: string): Promise<StoredDiscordState | null>;
  store(state: StoredDiscordState, ttlSeconds: number): Promise<void>;
}
