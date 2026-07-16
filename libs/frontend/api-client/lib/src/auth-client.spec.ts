import { describe, expect, it } from 'vitest';
import { resolveBetterAuthBaseUrl } from './auth-client';

describe('resolveBetterAuthBaseUrl', () => {
  it('keeps every Better Auth request on the browser origin in same-origin mode', () => {
    expect(
      resolveBetterAuthBaseUrl({
        VITE_API_BASE_URL_MODE: 'same-origin',
        VITE_AUTH_API_BASE_URL: 'https://auth-app-api.example.com',
      }),
    ).toBe('https://app.local.test');
  });

  it('uses the dedicated auth API value before generic frontend API values', () => {
    expect(
      resolveBetterAuthBaseUrl({
        NEXT_PUBLIC_API_URL: 'https://next.example.com',
        VITE_API_BASE_URL: 'https://user-app-api.example.com',
        VITE_AUTH_API_BASE_URL: 'https://auth-app-api.example.com',
      }),
    ).toBe('https://auth-app-api.example.com');
  });

  it('uses the Next.js-compatible value first', () => {
    expect(
      resolveBetterAuthBaseUrl({
        NEXT_PUBLIC_API_URL: 'https://auth-app-api.example.com',
        VITE_API_BASE_URL: 'https://user-app-api.example.com',
      }),
    ).toBe('https://auth-app-api.example.com');
  });

  it('uses the Vite-compatible value when available', () => {
    expect(resolveBetterAuthBaseUrl({ VITE_API_BASE_URL: 'https://user-app-api.example.com' })).toBe(
      'https://user-app-api.example.com',
    );
  });

  it('falls back to the browser origin for same-origin deployments', () => {
    expect(resolveBetterAuthBaseUrl({})).toBe('https://app.local.test');
  });
});
