import type { QueryClient } from "@tanstack/react-query";
import { authApi, userApi } from "@app/frontend-api-client";
import { clearApiAuthRequired } from "@app/frontend-api-support";
import {
  createMobxMutation,
  type AuthShellStore,
  type MobxMutation,
} from "@app/frontend-runtime";

export interface LogoutModelOptions {
  /** Clears the bearer/refresh session shell state client-side. */
  authStore: Pick<AuthShellStore, "clearSession">;
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
 * the network request fails, so a stale bearer token can never survive logout.
 */
export class LogoutModel {
  readonly mutation: MobxMutation;
  private readonly authStore: Pick<AuthShellStore, "clearSession">;
  private readonly queryClient: QueryClient;

  constructor({ authStore, logout, queryClient }: LogoutModelOptions) {
    this.authStore = authStore;
    this.queryClient = queryClient;
    this.mutation = createMobxMutation({
      mutationFn: () => logout(),
      queryClient,
      retry: false,
    });
  }

  get isPending(): boolean {
    return this.mutation.isPending;
  }

  async signOut({ onSignedOut }: SignOutOptions = {}): Promise<void> {
    try {
      // Send the request while the bearer token is still attached so the
      // backend can revoke the server-side session.
      await this.mutation.mutate();
    } catch {
      // Ignore request failures: the client-side session must be cleared even
      // when the network call fails or the token is already invalid.
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
