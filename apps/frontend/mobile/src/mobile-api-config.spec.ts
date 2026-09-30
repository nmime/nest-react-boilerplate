// @requirements REQ-FRONTEND-NATIVE-006
import { createApiClientRegistry } from '@app/frontend-api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMobileApiConfig } from './shared';

afterEach(() => vi.unstubAllGlobals());

describe('native API configuration and transport', () => {
  it('keeps an unconfigured native shell local-only and preserves web same-origin cookies', () => {
    expect(resolveMobileApiConfig('android', {})).toBeNull();
    expect(resolveMobileApiConfig('ios', { baseUrl: '  ' })).toBeNull();
    expect(resolveMobileApiConfig('web', { baseUrl: 'same-origin' })).toMatchObject({
      baseUrls: { admin: '', auth: '', user: '' },
      credentials: 'include',
    });
    expect(resolveMobileApiConfig('web', {})).toMatchObject({
      baseUrls: { admin: '', auth: '', user: '' },
      credentials: 'include',
    });
  });

  it('rejects relative, credentialed, partial, and malformed native configuration', () => {
    for (const baseUrl of [
      'same-origin',
      '/api',
      'https://user:pass@api.example.invalid',
      'https://api.example.invalid?token=private',
      'https://api.example.invalid#secret',
      'file:///tmp/api',
    ]) {
      expect(() => resolveMobileApiConfig('ios', { baseUrl })).toThrow(/Mobile API/);
    }
    expect(() => resolveMobileApiConfig('android', { authUrl: 'https://auth.example.invalid' })).toThrow(/absolute/);
  });

  it('sends the real generated preference request to its configured origin without browser globals', async () => {
    vi.stubGlobal('location', undefined);
    const requests: Request[] = [];
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      // A product-owned secure transport attaches the current credential at request time.
      request.headers.set('Authorization', 'Bearer owned-native-session-fixture');
      requests.push(request);
      return new Response(JSON.stringify({ data: { user: { locale: 'ru' } } }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const config = resolveMobileApiConfig(
      'android',
      {
        baseUrl: 'https://gateway.example.invalid/',
        authUrl: 'https://auth.example.invalid/api/v1/',
      },
      transport,
    );
    expect(config).not.toBeNull();
    const client = createApiClientRegistry(config!);
    await client.auth.api.authControllerUpdatePreferences({ locale: 'ru' }, client.auth.requestOptions);
    expect(transport).toHaveBeenCalledOnce();
    expect(requests[0]?.url).toBe('https://auth.example.invalid/api/v1/auth/me/preferences');
    expect(requests[0]?.credentials).toBe('omit');
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer owned-native-session-fixture');
    expect(requests[0]?.headers.get('cookie')).toBeNull();
    expect(await requests[0]?.json()).toEqual({ locale: 'ru' });
  });
});
