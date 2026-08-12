import { useCallback, useEffect } from 'react';
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

/**
 * Delegates in-app anchor clicks to the router so plain `<a href="/...">` links
 * route client-side. Installed by the root route rather than the shell so
 * chrome-less routes keep client-side navigation.
 */
export const useInAppLinkNavigation = (): void => {
  const navigate = useUserNavigate();

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      // Let the browser handle anything that is not a plain left click, or a
      // click the app already handled, so new-tab/download/modified clicks work.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const anchorTarget = anchor.getAttribute('target');
      if ((anchorTarget && anchorTarget !== '_self') || anchor.hasAttribute('download')) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('/')) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    globalThis.document.addEventListener('click', clickHandler);
    return () => {
      globalThis.document.removeEventListener('click', clickHandler);
    };
  }, [navigate]);
};
