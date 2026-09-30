// @requirements REQ-FRONTEND-SSR-007
import { describe, expect, it } from 'vitest';
import { resolveSiteDestinations } from './site-destinations';

describe('site public navigation authority', () => {
  it('omits missing, blank and unsafe destinations', () => {
    expect(resolveSiteDestinations({})).toEqual({ userApp: undefined, landingApp: undefined });
    for (const value of [
      ' ',
      '//attacker.test/path',
      '/\\attacker.test/path',
      'javascript:alert(1)',
      'https://user:password@example.test',
      'https://example.test?token=secret',
      'https://example.test#token',
      'http://example.test',
      'http://localhost:4201',
      'not a URL',
    ]) {
      expect(resolveSiteDestinations({ SITE_USER_APP_URL: value }).userApp).toBeUndefined();
    }
  });

  it('keeps explicit HTTPS destinations and same-origin paths', () => {
    expect(
      resolveSiteDestinations({
        SITE_USER_APP_URL: ' https://account.example.test ',
        SITE_LANDING_APP_URL: '/landing',
      }),
    ).toEqual({ userApp: 'https://account.example.test/', landingApp: '/landing' });
  });

  it('allows exact loopback HTTP only under an explicit development opt-in', () => {
    for (const host of ['localhost', '127.0.0.1']) {
      expect(
        resolveSiteDestinations({ SITE_ALLOW_LOOPBACK_HTTP: 'true', SITE_USER_APP_URL: `http://${host}:4201/` })
          .userApp,
      ).toBe(`http://${host}:4201/`);
    }
    for (const host of ['localhost.attacker.test', '127.0.0.2', 'example.test']) {
      expect(
        resolveSiteDestinations({ SITE_ALLOW_LOOPBACK_HTTP: 'true', SITE_USER_APP_URL: `http://${host}:4201/` })
          .userApp,
      ).toBeUndefined();
    }
  });
});
