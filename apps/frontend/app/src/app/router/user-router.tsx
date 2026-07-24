import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import type { Locale, UiTheme } from '@app/frontend-runtime';
import { createUserRouter } from './user-route-tree';

export interface UserRouterProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

/**
 * Mounts the user app's TanStack Router. `applyUserLocale`/`applyUserTheme`
 * are injected as router context (read by the auth/profile routes) and kept
 * current through the `RouterProvider` `context` prop.
 */
export function UserRouter({ applyUserLocale, applyUserTheme }: Readonly<UserRouterProps>) {
  const [router] = useState(createUserRouter);

  return <RouterProvider context={{ applyUserLocale, applyUserTheme }} router={router} />;
}
