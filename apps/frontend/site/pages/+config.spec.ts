// @requirements REQ-FRONTEND-SHELL-004
import { describe, expect, it } from 'vitest';
import { resolveProductBrand } from '@app/frontend-api-support';
import config from './+config';

describe('site document configuration', () => {
  // The site is the server-rendered surface, so its title and icon are what a crawler or a
  // link preview sees. Taking them from the shared brand keeps it from being the one app
  // that still needs a source edit to rebrand.
  it('titles and icons the rendered document from the shared product brand', () => {
    const brand = resolveProductBrand(import.meta.env, {});

    expect(config.title).toBe(brand.name);
    expect(config.favicon).toBe(brand.iconHref);
  });
});
