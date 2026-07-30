import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import type { Locale, UiTheme } from '@app/frontend-runtime';
import { createUserRouter } from './user-route-tree';
import { UserRuntimeProvider } from './user-runtime-context';

export interface UserRouterProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

/**
 * Mounts the user app's TanStack Router. `applyUserLocale`/`applyUserTheme` are
 * provided above the router via a React runtime context, read by the
 * auth/profile routes through `useUserRuntime`.
 */
export function UserRouter({ applyUserLocale, applyUserTheme }: Readonly<UserRouterProps>) {
  const [router] = useState(createUserRouter);

  return (
    <UserRuntimeProvider value={{ applyUserLocale, applyUserTheme }}>
      <RouterProvider router={router} />
    </UserRuntimeProvider>
  );
}
