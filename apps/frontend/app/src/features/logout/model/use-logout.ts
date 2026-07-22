import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthApiClient } from '@app/frontend-api-client';
import { useAuthShellStore } from '@app/frontend-runtime';
import { requestLogout } from '../api';
import { LogoutModel } from './logout-model';

export interface UseLogoutInput {
  navigate?: (to: string, options?: { replace?: boolean }) => void;
  redirectTo?: string;
}

export interface UseLogoutResult {
  model: LogoutModel;
  signOut: () => void;
}

/**
 * Wires the observable {@link LogoutModel} to the active TanStack Query client,
 * auth api-client, and auth shell store. The request uses the browser's
 * HttpOnly session cookie through the shared API client.
 */
export function useLogout({ navigate, redirectTo = '/auth' }: UseLogoutInput = {}): UseLogoutResult {
  const queryClient = useQueryClient();
  const authClient = useAuthApiClient();
  const authStore = useAuthShellStore();
  const authClientRef = useRef(authClient);
  authClientRef.current = authClient;

  const [model] = useState(
    () =>
      new LogoutModel({
        authStore,
        logout: () => requestLogout(authClientRef.current),
        queryClient,
      }),
  );

  useEffect(() => {
    return () => {
      model.destroy();
    };
  }, [model]);

  const signOut = useCallback(() => {
    void model.signOut({
      onSignedOut: () => navigate?.(redirectTo, { replace: true }),
    });
  }, [model, navigate, redirectTo]);

  return { model, signOut };
}
