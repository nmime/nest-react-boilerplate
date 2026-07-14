import { Injectable } from '@nestjs/common';
import type { DiscordCustomIdAction } from './discord-custom-id.codec';

export interface DiscordNavigationState {
  nonce: string;
  action: DiscordCustomIdAction;
  userId: string;
  guildId?: string | null;
  tenantId: string;
  locale: string;
  path: string[];
  data?: Record<string, unknown>;
  expiresAt: Date;
}

const DefaultMaxEntries = 10_000;
const SweepIntervalMs = 60_000;

// NOTE: this is a single-process store. Multi-replica deployments need a shared
// store (e.g. Redis) so navigation state is visible across instances.
/* v8 ignore start -- Nest @Injectable() emits a decorator-helper branch that is unreachable for a class-only decorator. */
@Injectable()
/* v8 ignore stop */
export class DiscordNavigationStateService {
  private readonly states = new Map<string, DiscordNavigationState>();
  private readonly maxEntries = DefaultMaxEntries;
  private lastSweepAt = 0;

  put(state: DiscordNavigationState): void {
    const now = Date.now();
    // Re-inserting moves the entry to the newest position (Map keeps insertion
    // order) so it is evicted last. Expired entries are removed lazily on read
    // and by a time-gated sweep, keeping per-put work O(1) instead of scanning
    // the whole map on every write.
    this.states.delete(state.nonce);
    this.states.set(state.nonce, { ...state });
    this.evictOverflow();
    this.maybeSweep(now);
  }

  get(nonce: string, now = new Date()): DiscordNavigationState | null {
    const state = this.states.get(nonce);
    if (!state) {
      return null;
    }
    if (state.expiresAt <= now) {
      this.states.delete(nonce);
      return null;
    }
    return { ...state, path: [...state.path], data: { ...state.data } };
  }

  delete(nonce: string): boolean {
    return this.states.delete(nonce);
  }

  private evictOverflow(): void {
    // Map preserves insertion order, so iterating keys yields oldest-first.
    // Delete from the front until back within capacity, keeping per-put work
    // proportional to the overflow instead of scanning the whole map.
    for (const nonce of this.states.keys()) {
      if (this.states.size <= this.maxEntries) {
        break;
      }
      this.states.delete(nonce);
    }
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweepAt < SweepIntervalMs) {
      return;
    }
    this.lastSweepAt = now;
    const cutoff = new Date(now);
    for (const [nonce, state] of this.states) {
      if (state.expiresAt <= cutoff) {
        this.states.delete(nonce);
      }
    }
  }
}
