import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthApiClient } from '@app/frontend-api-client';
import { useAuthShellStore } from '@app/frontend-runtime';
import { requestLogout } from './logout-api';
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
  const logout = useCallback(() => requestLogout(authClient), [authClient]);
  const [model] = useState(
    () =>
      new LogoutModel({
        authStore,
        logout,
        queryClient,
      }),
  );

  // The model is created once but the client registry is rebuilt whenever the
  // runtime config changes, so re-bind the request as each new client arrives.
  useEffect(() => {
    model.setLogout(logout);
  }, [logout, model]);

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
