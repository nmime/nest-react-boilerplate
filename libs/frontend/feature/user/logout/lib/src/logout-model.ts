import type { QueryClient } from '@tanstack/react-query';
import { authApi, userApi } from '@app/frontend-api-client';
import { clearApiAuthRequired } from '@app/frontend-api-support';
import { createMobxMutation, type AuthShellStore, type MobxMutation } from '@app/frontend-runtime';

export interface LogoutModelOptions {
  /** Clears the session shell state client-side. */
  authStore: Pick<AuthShellStore, 'clearSession'>;
  /** Sends the logout request (kept injectable so specs can mock it). */
  logout: () => Promise<unknown>;
  /** Shared TanStack Query client that owns the observable server state. */
  queryClient: QueryClient;
}

export interface SignOutOptions {
  onSignedOut?: () => void;
}

/**
 * MobX model that owns the sign-out flow as observable server state via
 * `createMobxMutation`. The session is always cleared client-side, even when
 * the network request fails, so stale authenticated UI state cannot survive logout.
 */
export class LogoutModel {
  readonly mutation: MobxMutation;
  private readonly authStore: Pick<AuthShellStore, 'clearSession'>;
  private readonly queryClient: QueryClient;
  private logout: () => Promise<unknown>;

  constructor({ authStore, logout, queryClient }: LogoutModelOptions) {
    this.authStore = authStore;
    this.queryClient = queryClient;
    this.logout = logout;
    this.mutation = createMobxMutation({
      mutationFn: () => this.logout(),
      queryClient,
      retry: false,
    });
  }

  /**
   * Replaces the logout request. The model is created once per mount but the
   * API client registry is rebuilt whenever the runtime base URLs, headers, or
   * fetch implementation change, so the request has to be re-bound.
   */
  setLogout(logout: () => Promise<unknown>): void {
    this.logout = logout;
  }

  get isPending(): boolean {
    return this.mutation.isPending;
  }

  async signOut({ onSignedOut }: SignOutOptions = {}): Promise<void> {
    try {
      // Let the backend destroy the server-side session before clearing UI state.
      await this.mutation.mutate();
    } catch {
      // Ignore request failures: the client-side session must be cleared even
      // when the network call fails or the session is already invalid.
    }

    this.authStore.clearSession();
    clearApiAuthRequired();
    this.clearServerState();
    onSignedOut?.();
  }

  destroy(): void {
    this.mutation.destroy();
  }

  private clearServerState(): void {
    void this.queryClient.invalidateQueries({
      queryKey: authApi.getAuthControllerMeQueryKey(),
    });
    void this.queryClient.invalidateQueries({
      queryKey: userApi.getProfileControllerMeQueryKey(),
    });
    void this.queryClient.invalidateQueries({
      queryKey: authApi.getAuthControllerProviderIdentitiesQueryKey(),
    });
  }
}
