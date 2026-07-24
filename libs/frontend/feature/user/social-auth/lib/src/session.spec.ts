import { describe, expect, it } from 'vitest';
import { getReturnUrlFromExternalAuthResult, getSessionFromExternalAuthResult } from './session';

describe('external auth result helpers', () => {
  it('extracts the session or returns null', () => {
    const session = { token: 'abc' } as never;
    expect(getSessionFromExternalAuthResult({ session } as never)).toBe(session);
    expect(getSessionFromExternalAuthResult({} as never)).toBeNull();
  });

  it('extracts the return url or returns null', () => {
    expect(getReturnUrlFromExternalAuthResult({ returnUrl: '/profile' } as never)).toBe('/profile');
    expect(getReturnUrlFromExternalAuthResult({} as never)).toBeNull();
  });
});
