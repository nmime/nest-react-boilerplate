// @requirements REQ-FRONTEND-SHELL-004
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { defineUserRoutes } from './user-route-registry';
import { createUserRouter } from './user-route-tree';
import { userRoutes } from './user-routes';

const renderAt = (path: string, routes?: Parameters<typeof createUserRouter>[1]) => {
  const router = createUserRouter(createMemoryHistory({ initialEntries: [path] }), routes);
  return render(
    <FrontendStateProvider>
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <RouterProvider router={router} />
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('user route tree', () => {
  it('registers exactly the pages declared in the route registry', () => {
    expect(userRoutes.map((route) => route.path)).toEqual([
      '/',
      '/auth',
      '/auth/discord/callback',
      '/auth/telegram/callback',
      '/profile',
      '/settings',
      '/tma',
      '/tma/auth',
      '/telegram-mini-app',
      '/link/telegram',
      '/link/discord',
    ]);
  });

  it('renders a not-found page for an unknown URL instead of the home page', async () => {
    renderAt('/no-such-page');

    expect(await screen.findByText('The requested resource was not found.')).toBeTruthy();
    expect(screen.queryByText('Account essentials')).toBeNull();
  });

  it('renders a chrome-less route outside the shell', async () => {
    const routes = defineUserRoutes([
      { component: () => <p>Framed page</p>, nav: { label: 'user.nav.home', order: 1 }, path: '/' },
      { chrome: 'none', component: () => <p>Bare page</p>, path: '/embed' },
    ]);

    const { container } = renderAt('/embed', routes);

    expect(await screen.findByText('Bare page')).toBeTruthy();
    expect(container.querySelector('.xr-mini-app-shell')).toBeNull();
  });

  it('names the shell from the product brand configuration, not a source literal', async () => {
    vi.stubEnv('VITE_PRODUCT_NAME', 'Acme Cloud');

    renderAt('/no-such-page');

    expect(await screen.findAllByLabelText('Acme Cloud bottom navigation')).not.toHaveLength(0);
  });

  it('highlights the nav entry that owns a detail page reached through a path parameter', async () => {
    const routes = defineUserRoutes([
      { component: () => <p>Item list</p>, nav: { label: 'user.nav.home', order: 1 }, path: '/items' },
      { component: () => <p>Item detail</p>, navParent: '/items', path: '/items/$itemId' },
    ]);

    renderAt('/items/abc', routes);

    expect(await screen.findByText('Item detail')).toBeTruthy();
    const current = await screen.findAllByRole('link', { current: 'page' });
    expect(current.map((link) => link.getAttribute('href'))).toEqual(['/items']);
  });

  it('keeps the shell around routes that opt into chrome', async () => {
    const routes = defineUserRoutes([
      { component: () => <p>Framed page</p>, nav: { label: 'user.nav.home', order: 1 }, path: '/' },
      { chrome: 'none', component: () => <p>Bare page</p>, path: '/embed' },
    ]);

    const { container } = renderAt('/', routes);

    expect(await screen.findByText('Framed page')).toBeTruthy();
    expect(container.querySelector('.xr-mini-app-shell')).toBeTruthy();
  });
});
