// @requirements REQ-AUTH-SESSION-002
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedTheme } from '@app/backend-feature-auth-shared';
import { principalFromUserView } from './principal.mapper';
import { callSessionMethod, clearRequestSession, SessionCookieName } from './session-lifecycle.util';

describe('session lifecycle utilities', () => {
  it('handles absent, promise, void, and callback-style session methods', async () => {
    await expect(callSessionMethod({}, 'save')).resolves.toBeUndefined();

    const promiseSave = vi.fn(() => Promise.resolve());
    await expect(callSessionMethod({ session: { save: promiseSave } }, 'save')).resolves.toBeUndefined();
    expect(promiseSave).toHaveBeenCalledOnce();

    const voidSave = vi.fn(() => undefined);
    await expect(callSessionMethod({ session: { save: voidSave } }, 'save')).resolves.toBeUndefined();
    expect(voidSave).toHaveBeenCalledOnce();

    const callbackDestroy = vi.fn((callback: (error?: unknown) => void) => {
      callback('boom');
    });
    await expect(callSessionMethod({ session: { destroy: callbackDestroy } }, 'destroy')).rejects.toThrow(
      'Session lifecycle method failed.',
    );

    const errorDestroy = vi.fn((callback: (error?: unknown) => void) => {
      callback(new Error('destroy failed'));
    });
    await expect(callSessionMethod({ session: { destroy: errorDestroy } }, 'destroy')).rejects.toThrow(
      'destroy failed',
    );
  });

  it('clears production-default cookies and maps nullable principal fields', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env[SessionCookieName];
    const clearCookie = vi.fn();
    const request = {
      auth: { subject: 'user-id', tenantId: 'tenant-id', roles: [], permissions: [] },
      res: { clearCookie },
      session: {
        destroy: vi.fn((callback: (error?: unknown) => void) => {
          callback();
        }),
      },
      user: { subject: 'user-id', tenantId: 'tenant-id', roles: [], permissions: [] },
    };

    await clearRequestSession(request);
    expect(clearCookie).toHaveBeenCalledWith('__Host-nrb.sid', { path: '/' });
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();

    expect(
      principalFromUserView(
        { subject: 'old-id', tenantId: 'old-tenant', roles: [], permissions: [] },
        {
          id: 'user-id',
          tenantId: 'tenant-id',
          email: null,
          // A private-use tag, so it can never become a supported locale and quietly turn this
          // assertion into a no-op the way a real tag like "uz" would the day it ships.
          locale: 'x-unsupported' as never,
          theme: AuthenticatedTheme.System,
          roles: [],
          permissions: [],
        },
      ),
    ).toMatchObject({
      subject: 'user-id',
      tenantId: 'tenant-id',
      email: undefined,
      locale: undefined,
    });

    delete process.env.NODE_ENV;
  });
});
