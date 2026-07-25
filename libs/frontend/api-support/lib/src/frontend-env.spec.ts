import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
  getApiBaseUrl,
  getDefaultFrontendBuildApiBaseUrlMode,
  getFrontendRuntimeConfig,
  resolveFeatureFlag,
  type FrontendBuildEnv,
  type FrontendEnv,
} from './frontend-env';

const productionEnv = (overrides: FrontendEnv = {}): FrontendEnv => ({
  DEV: false,
  MODE: 'production',
  ...overrides,
});

describe('frontend environment API URL resolution', () => {
  it('uses empty API roots only when same-origin mode is explicit', () => {
    expect(getApiBaseUrl(productionEnv({ VITE_API_BASE_URL_MODE: 'same-origin' }), 'VITE_AUTH_API_BASE_URL')).toBe('');
  });

  it('lets same-origin mode override stale explicit API origins', () => {
    expect(
      getApiBaseUrl(
        productionEnv({
          VITE_API_BASE_URL_MODE: 'same-origin',
          VITE_AUTH_API_BASE_URL: 'https://legacy-auth.example.test',
        }),
        'VITE_AUTH_API_BASE_URL',
      ),
    ).toBe('');
  });

  it('normalizes explicit API origins for split-origin frontend builds', () => {
    expect(
      getApiBaseUrl(
        productionEnv({
          VITE_AUTH_API_BASE_URL: ' https://auth.example.test/ ',
        }),
        'VITE_AUTH_API_BASE_URL',
      ),
    ).toBe('https://auth.example.test');
  });

  it.each([
    'javascript:alert(1)',
    'https://user:secret@auth.example.test',
    'https://auth.example.test/api',
    'https://auth.example.test?tenant=one',
    'https://auth.example.test/#fragment',
  ])('rejects unsafe or non-origin API base URLs: %s', (value) => {
    expect(() =>
      getApiBaseUrl(
        productionEnv({
          VITE_AUTH_API_BASE_URL: value,
        }),
        'VITE_AUTH_API_BASE_URL',
      ),
    ).toThrow(/absolute HTTP\(S\) origin/u);
  });

  it.each([
    { DEV: true, MODE: 'production' },
    { DEV: false, MODE: 'development' },
    { DEV: false, MODE: 'test' },
  ])('uses same-origin API roots in non-production environments: %o', (env) => {
    expect(getApiBaseUrl(env, 'VITE_AUTH_API_BASE_URL')).toBe('');
  });

  it('fails closed for production without explicit origins or same-origin mode', () => {
    expect(() => getApiBaseUrl(productionEnv(), 'VITE_AUTH_API_BASE_URL')).toThrow(
      /VITE_AUTH_API_BASE_URL is required/u,
    );
  });
});

describe('frontend build API URL mode defaults', () => {
  it('defaults direct production build targets to same-origin when no API mode or origins are configured', () => {
    const env: FrontendBuildEnv = {};

    expect(getDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe('same-origin');
    expect(applyDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe(true);
    expect(env['VITE_API_BASE_URL_MODE']).toBe('same-origin');
    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls(env, 'build', 'production');
    }).not.toThrow();
  });

  it('preserves explicit split-origin mode instead of defaulting', () => {
    const env: FrontendBuildEnv = {
      VITE_API_BASE_URL_MODE: 'split-origin',
    };

    expect(applyDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe(false);
    expect(env['VITE_API_BASE_URL_MODE']).toBe('split-origin');
  });

  it('removes stale explicit origins from same-origin production builds', () => {
    const env: FrontendBuildEnv = {
      VITE_API_BASE_URL_MODE: 'same-origin',
      VITE_AUTH_API_BASE_URL: 'https://legacy-auth.example.test',
      VITE_USER_API_BASE_URL: 'https://legacy-user.example.test',
      VITE_ADMIN_API_BASE_URL: 'https://legacy-admin.example.test',
    };

    expect(applyDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe(false);
    expect(env).toEqual({ VITE_API_BASE_URL_MODE: 'same-origin' });
  });

  it('preserves explicit API origins and lets them satisfy production builds', () => {
    const env: FrontendBuildEnv = {
      VITE_AUTH_API_BASE_URL: 'https://auth-app-api.example.com',
      VITE_USER_API_BASE_URL: 'https://user-app-api.example.com',
      VITE_ADMIN_API_BASE_URL: 'https://admin-app-api.example.com',
    };

    expect(applyDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe(false);
    expect(env['VITE_API_BASE_URL_MODE']).toBeUndefined();
    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls(env, 'build', 'production');
    }).not.toThrow();
  });

  it('rejects invalid origins during the production build assertion', () => {
    const env: FrontendBuildEnv = {
      VITE_AUTH_API_BASE_URL: 'https://auth-app-api.example.com/path',
      VITE_USER_API_BASE_URL: 'https://user-app-api.example.com',
      VITE_ADMIN_API_BASE_URL: 'https://admin-app-api.example.com',
    };

    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls(env, 'build', 'production');
    }).toThrow(/VITE_AUTH_API_BASE_URL must be an absolute HTTP\(S\) origin/u);
  });

  it('skips production API URL assertions for non-production build targets', () => {
    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls({}, 'serve', 'production');
    }).not.toThrow();
    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls({}, 'build', 'development');
    }).not.toThrow();
  });

  it('still fails closed for partial explicit API origin configuration', () => {
    const env: FrontendBuildEnv = {
      VITE_AUTH_API_BASE_URL: 'https://auth-app-api.example.com',
    };

    expect(applyDefaultFrontendBuildApiBaseUrlMode(env, 'build', 'production')).toBe(false);
    expect(() => {
      assertRequiredFrontendBuildApiBaseUrls(env, 'build', 'production');
    }).toThrow(/VITE_USER_API_BASE_URL, VITE_ADMIN_API_BASE_URL/u);
  });
});

describe('runtime feature flags', () => {
  afterEach(() => {
    delete (globalThis as { __APP_RUNTIME_CONFIG__?: unknown }).__APP_RUNTIME_CONFIG__;
  });

  it('prefers the per-deployment runtime value over the baked build value', () => {
    // One image, many environments: runtime config must win both directions.
    expect(resolveFeatureFlag('true', 'false')).toBe(true);
    expect(resolveFeatureFlag('false', 'true')).toBe(false);
    expect(resolveFeatureFlag(true, undefined)).toBe(true);
  });

  it('falls back to the build value when runtime config is absent or unparsable', () => {
    expect(resolveFeatureFlag(undefined, 'true')).toBe(true);
    expect(resolveFeatureFlag('', 'true')).toBe(true);
    expect(resolveFeatureFlag('maybe', 'true')).toBe(true);
    expect(resolveFeatureFlag(undefined, undefined)).toBe(false);
  });

  it('treats flags case-insensitively and ignores surrounding whitespace', () => {
    expect(resolveFeatureFlag('  TRUE ', undefined)).toBe(true);
    expect(resolveFeatureFlag(' False ', 'true')).toBe(false);
  });

  it('reads the injected global runtime config, defaulting to an empty object', () => {
    expect(getFrontendRuntimeConfig()).toEqual({});
    (globalThis as { __APP_RUNTIME_CONFIG__?: unknown }).__APP_RUNTIME_CONFIG__ = {
      telegramAuthEnabled: 'true',
    };
    expect(getFrontendRuntimeConfig()['telegramAuthEnabled']).toBe('true');
  });

  it('ignores a non-object runtime global instead of throwing', () => {
    (globalThis as { __APP_RUNTIME_CONFIG__?: unknown }).__APP_RUNTIME_CONFIG__ = 'nope';
    expect(getFrontendRuntimeConfig()).toEqual({});
  });
});
