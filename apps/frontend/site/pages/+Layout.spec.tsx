import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/frontend-runtime', () => ({
  FrontendI18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FrontendQueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FrontendStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useI18n: () => ({
    t: (key: string) => (key === 'user.appName' ? 'Nest React Boilerplate' : key),
  }),
}));

vi.mock('@app/frontend-feature-user-i18n', () => ({
  userFrontendTranslations: {},
}));

vi.mock('../styles/site.css', () => ({}));

describe('site layout', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders the nav with the app name', async () => {
    const { Layout } = await import('./+Layout');
    render(
      <Layout>
        <div data-testid="child">Child content</div>
      </Layout>,
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toBeTruthy();

    const link = screen.getByRole('link', { name: 'Nest React Boilerplate' });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders children inside the layout shell', async () => {
    const { Layout } = await import('./+Layout');
    render(
      <Layout>
        <div data-testid="child">Child content</div>
      </Layout>,
    );

    expect(screen.getByTestId('child').textContent).toBe('Child content');
  });

  it('wraps children in a main element with class site-shell', async () => {
    const { Layout } = await import('./+Layout');
    render(
      <Layout>
        <div>Content</div>
      </Layout>,
    );

    const main = document.querySelector('main.site-shell');
    expect(main).toBeTruthy();
  });
});
