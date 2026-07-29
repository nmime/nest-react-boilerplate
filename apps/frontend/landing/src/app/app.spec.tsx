import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '.';
import { getAuthApiDocsHref } from '../features/landing-actions';
import { LandingReactIsland } from './landing-react-island';

describe('Landing app', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders neutral template copy and preserves reference links', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Nest React Boilerplate');
    expect(html).toContain('A focused foundation for your next product.');
    expect(html).toContain('Clear ownership from the first screen.');
    expect(html).toContain('href="/auth/docs"');
    expect(html).toContain('href="/app"');
    expect(html).toContain('href="/admin"');
  });

  it('shows the reference surfaces without repository diagnostics', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Public presence');
    expect(html).toContain('Customer account');
    expect(html).toContain('Admin workspace');
    expect(html).not.toContain('Design v3');
    expect(html).not.toContain('Route readiness');
    expect(html).not.toContain('Release gates');
    expect(html).not.toContain('data-smoke-marker');
  });

  it('uses a configured auth API docs URL when provided', () => {
    expect(
      getAuthApiDocsHref({
        DEV: false,
        MODE: 'production',
        VITE_API_BASE_URL_MODE: 'explicit',
        VITE_AUTH_API_BASE_URL: 'https://auth.example.test/',
      }),
    ).toBe('https://auth.example.test/docs');
  });

  it('keeps the docs action available when production config falls back', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_API_BASE_URL_MODE', '');
    vi.stubEnv('VITE_AUTH_API_BASE_URL', '');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('href="/auth/docs"');
    expect(html).not.toContain('configuration');
  });

  it('renders the React island shell around the landing app', () => {
    const html = renderToStaticMarkup(<LandingReactIsland />);

    expect(html).toContain('Nest React Boilerplate');
  });
});
