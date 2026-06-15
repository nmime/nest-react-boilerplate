import { Injectable } from "@nestjs/common";
import type { DiscordCustomIdAction } from "./discord-custom-id.codec";

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

@Injectable()
export class DiscordNavigationStateService {
  private readonly states = new Map<string, DiscordNavigationState>();

  put(state: DiscordNavigationState): void {
    this.prune();
    this.states.set(state.nonce, { ...state });
  }

  get(
    nonce: string,
    owner: { userId: string; guildId?: string | null; tenantId: string },
    now = new Date(),
  ): DiscordNavigationState | null {
    const state = this.states.get(nonce);
    if (!state) {
      return null;
    }
    if (state.expiresAt <= now) {
      this.states.delete(nonce);
      return null;
    }
    if (
      state.userId !== owner.userId ||
      state.tenantId !== owner.tenantId ||
      (state.guildId ?? "") !== (owner.guildId ?? "")
    ) {
      return null;
    }
    return { ...state, path: [...state.path], data: { ...state.data } };
  }

  delete(nonce: string): boolean {
    return this.states.delete(nonce);
  }

  private prune(now = new Date()): void {
    for (const [nonce, state] of this.states) {
      if (state.expiresAt <= now) {
        this.states.delete(nonce);
      }
    }
  }
}
