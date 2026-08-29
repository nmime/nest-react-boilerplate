import type { DiscordOauthStateStore } from './type/discord-oauth-state-store.type';
import type { StoredDiscordState } from '../application/type/external-auth-internal.type';

/** Single-process fallback used only when no shared state store is configured. */
export class InMemoryDiscordOauthStateStore implements DiscordOauthStateStore {
  private readonly states = new Map<string, StoredDiscordState>();

  constructor(private readonly maxEntries: () => number) {}

  store(state: StoredDiscordState, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return Promise.resolve();
    }
    this.prune();
    while (this.states.size >= this.maxEntries()) {
      const oldest = this.states.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.states.delete(oldest);
    }
    this.states.set(state.stateHash, state);
    return Promise.resolve();
  }

  consume(stateHash: string): Promise<StoredDiscordState | null> {
    const state = this.states.get(stateHash) ?? null;
    this.states.delete(stateHash);
    if (!state || state.expiresAt <= new Date()) {
      return Promise.resolve(null);
    }
    return Promise.resolve(state);
  }

  private prune(now: Date = new Date()): void {
    for (const [stateHash, state] of this.states) {
      if (state.expiresAt <= now) {
        this.states.delete(stateHash);
      }
    }
  }
}
