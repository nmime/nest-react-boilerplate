// @requirements REQ-FRONTEND-SSR-007
// Evidence for: REQ-FRONTEND-SSR-007
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/frontend-runtime', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const fallback: Record<string, string> = {
        'user.appName': 'Nest React Boilerplate',
        'user.eyebrow': 'Fullstack monorepo',
        'site.title': 'A dependable home',
        'site.description': 'Durable server-rendered content.',
        'site.actionGroup.label': 'Site actions',
        'site.action.app': 'Open account',
        'site.action.docs': 'View public landing',
        'site.metricGroup.label': 'Site principles',
      };
      return fallback[key] ?? key;
    },
  }),
}));

vi.mock('@app/frontend-feature-user-i18n', () => ({
  userFrontendTranslations: {},
}));

vi.mock('../styles/site.css', () => ({}));

describe('site home page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders the site hero with a heading and two CTA links', async () => {
    const { Page } = await import('./+Page');
    render(<Page />);

    const heading = screen.getByRole('heading', { name: 'A dependable home' });
    expect(heading).toBeTruthy();

    const appLink = screen.getByRole('link', { name: 'Open account' });
    expect(appLink.getAttribute('href')).toBe('/app');

    const landingLink = screen.getByRole('link', { name: 'View public landing' });
    expect(landingLink.getAttribute('href')).toBe('/');
  });

  it('renders three metric articles', async () => {
    const { Page } = await import('./+Page');
    render(<Page />);

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(3);
  });

  it('keeps the page focused on the two primary destinations', async () => {
    const { Page } = await import('./+Page');
    render(<Page />);

    const links = screen.getAllByRole('link', { name: /[A-Za-z]/ });
    expect(links).toHaveLength(2);
  });

  it('renders the server-owned problem registry as accessible articles', async () => {
    const { Page: ProblemsPage } = await import('../problems/+Page');
    render(<ProblemsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'site.problems.title' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'about:blank' })).toBeTruthy();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(1);
  });
});
