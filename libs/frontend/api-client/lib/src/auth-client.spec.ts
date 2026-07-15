import { describe, expect, it } from 'vitest';
import { resolveBetterAuthBaseUrl } from './auth-client';

describe('resolveBetterAuthBaseUrl', () => {
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

  it('falls back without requiring a browser process global', () => {
    expect(resolveBetterAuthBaseUrl({})).toBe('http://localhost:3003');
  });
});
