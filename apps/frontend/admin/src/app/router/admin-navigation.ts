import { useCallback } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { adminBasepath } from '../../shared';

export { adminBasepath };

/**
 * Full browser path (with the `/admin` prefix + query) for the active route,
 * reactive to client-side navigation. Pages parse it with `normalizeAdminPath`
 * / `paramsFromPath` for their sub-state.
 */
export const useAdminCurrentPath = (): string => {
  const location = useRouterState({ select: (state) => state.location });
  return `${adminBasepath}${location.pathname}${location.searchStr}`;
};

/** Navigate to a full `/admin/...` path through the router's own history. */
export const useAdminNavigate = (): ((to: string, options?: { replace?: boolean }) => void) => {
  const router = useRouter();
  return useCallback(
    (to, options) => {
      if (options?.replace) {
        router.history.replace(to);
      } else {
        router.history.push(to);
      }
    },
    [router],
  );
};
