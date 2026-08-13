// @requirements REQ-FRONTEND-SHELL-004
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Head } from './+Head';

describe('site document head', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The site is the server-rendered surface, so its title and icon are what a crawler or a link
  // preview sees. Taking them from the shared brand keeps it from being the one app that still
  // needs a source edit to rebrand.
  it('titles and icons the document from the shared product brand', () => {
    vi.stubEnv('VITE_PRODUCT_NAME', 'Dehqon Hub');
    vi.stubEnv('VITE_PRODUCT_ICON_HREF', '/brand/icon.svg');
    vi.stubEnv('VITE_PRODUCT_ICON_TYPE', 'image/svg+xml');
    vi.stubEnv('VITE_PRODUCT_THEME_COLOR', '#0f766e');

    const markup = renderToStaticMarkup(<Head />);

    expect(markup).toContain('<title>Dehqon Hub</title>');
    expect(markup).toContain('href="/brand/icon.svg"');
    expect(markup).toContain('type="image/svg+xml"');
    expect(markup).toContain('content="#0f766e"');
  });

  it('falls back to the boilerplate identity when nothing overrides it', () => {
    const markup = renderToStaticMarkup(<Head />);

    expect(markup).toContain('<title>Nest React Boilerplate</title>');
    expect(markup).toContain('href="/favicon.ico"');
  });
});
