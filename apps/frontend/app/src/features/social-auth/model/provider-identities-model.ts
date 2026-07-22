import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthApiClient, type AuthApiClient } from '@app/frontend-api-client';
import {
  createMobxMutation,
  createMobxQuery,
  useAuthShellStore,
  type AuthShellStore,
  type MobxMutation,
  type MobxQuery,
} from '@app/frontend-runtime';
import { fetchProviderIdentities, providerIdentitiesQueryKey, unlinkProviderIdentity } from '../api';

type ProviderIdentitiesData = Awaited<ReturnType<typeof fetchProviderIdentities>>;

export interface ProviderIdentitiesModelOptions {
  authStore: Pick<AuthShellStore, 'isAuthenticated'>;
  getAuthClient: () => AuthApiClient;
  queryClient: QueryClient;
}

/**
 * MobX model exposing linked social-provider identities as observable server
 * state. The list read and the unlink write are owned by `createMobxQuery` /
 * `createMobxMutation` against the shared TanStack Query cache, so the panel
 * only has to be an `observer`. `enabled` reacts to the auth shell store, and
 * the unlink mutation invalidates the same query key it reads from.
 */
export class ProviderIdentitiesModel {
  readonly identitiesQuery: MobxQuery<ProviderIdentitiesData>;
  readonly unlinkMutation: MobxMutation<unknown, string>;

  constructor({ authStore, getAuthClient, queryClient }: ProviderIdentitiesModelOptions) {
    this.identitiesQuery = createMobxQuery<ProviderIdentitiesData>({
      options: () => ({ enabled: authStore.isAuthenticated }),
      queryClient,
      queryFn: () => fetchProviderIdentities(getAuthClient()),
      queryKey: providerIdentitiesQueryKey(),
      retry: false,
    });
    this.unlinkMutation = createMobxMutation<unknown, string>({
      mutationFn: (identityId) => unlinkProviderIdentity(getAuthClient(), identityId),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: providerIdentitiesQueryKey(),
        }),
      queryClient,
      retry: false,
    });
  }

  unlink(identityId: string): void {
    // `mutate` rejects on failure; swallow it here since the failure is already
    // surfaced through the observable `unlinkMutation` result (isError/error).
    this.unlinkMutation.mutate(identityId).catch(() => undefined);
  }

  destroy(): void {
    this.identitiesQuery.destroy();
    this.unlinkMutation.destroy();
  }
}

/**
 * Creates the {@link ProviderIdentitiesModel} bound to the active query client
 * and auth shell store. The API client sends the browser's HttpOnly session
 * cookie with each request.
 */
export function useProviderIdentitiesModel(): ProviderIdentitiesModel {
  const queryClient = useQueryClient();
  const authClient = useAuthApiClient();
  const authStore = useAuthShellStore();
  const authClientRef = useRef(authClient);
  authClientRef.current = authClient;

  const [model] = useState(
    () =>
      new ProviderIdentitiesModel({
        authStore,
        getAuthClient: () => authClientRef.current,
        queryClient,
      }),
  );

  useEffect(() => {
    return () => {
      model.destroy();
    };
  }, [model]);

  return model;
}
