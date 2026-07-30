import { useCallback } from 'react';
import { useRouter } from '@tanstack/react-router';

/**
 * Navigation port shared by every user page. Feature hooks (`useSocialAuth`,
 * `useAuthSessionFlow`, `useLogout`) accept this exact signature so the same
 * models drive both the web app (this router-backed adapter) and native
 * (an `expo-router` adapter) — see the shared-logic design.
 */
export type UserNavigate = (to: string, options?: { replace?: boolean }) => void;

export const normalizePath = (path: string): string => {
  /* v8 ignore next -- browser location.pathname is never blank; fallback keeps the helper total for server snapshots. */
  const normalized = path.trim() || '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
};

export const getLinkRoute = (path: string): '/link/telegram' | '/link/discord' | null => {
  const normalized = normalizePath(path);
  if (normalized === '/link/telegram' || normalized === '/link/discord') {
    return normalized;
  }
  return null;
};

/**
 * Web adapter for the shared {@link UserNavigate} port. Drives the router's own
 * history so arbitrary internal targets (including query strings) route
 * client-side without callers depending on the typed route tree.
 */
export const useUserNavigate = (): UserNavigate => {
  const router = useRouter();
  return useCallback<UserNavigate>(
    (to, options) => {
      const url = new URL(to, globalThis.location.origin);
      const target = url.pathname + url.search + url.hash;
      if (options?.replace) {
        router.history.replace(target);
      } else {
        router.history.push(target);
      }
    },
    [router],
  );
};
