// @requirements REQ-FRONTEND-SHELL-004
import { defaultProductBrand } from '@app/frontend-api-support';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import expoConfig from '../app.config';

const resolve = (): ExpoConfig => expoConfig({ config: {} } as ConfigContext);

describe('mobile Expo config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Expo writes this name into the exported web document's <title>, and it is the one shell whose
  // markup neither the Vite brand pass nor an Astro template reaches -- so without this it stays
  // boilerplate-branded however the product configures everything else.
  it('takes its product name from the shared brand key', () => {
    vi.stubEnv('VITE_PRODUCT_NAME', 'Acme Cloud');

    expect(resolve().name).toBe('Acme Cloud');
  });

  it('falls back to the shared brand default when the deployment sets nothing', () => {
    vi.stubEnv('VITE_PRODUCT_NAME', '');

    expect(resolve().name).toBe(defaultProductBrand.name);
  });

  it('ignores a blank name rather than shipping an empty title', () => {
    vi.stubEnv('VITE_PRODUCT_NAME', '   ');

    expect(resolve().name).toBe(defaultProductBrand.name);
  });
});
