// @requirements REQ-AUTH-FRONTEND-009
import { describe, expect, it, vi } from 'vitest';
import { AuthMode, authMeQueryKey, createAuthSession, fetchAuthMe } from './index';

const ok = (data: unknown) => ({ data: { data }, response: new Response(null) });
const fail = () => ({ error: { detail: 'nope' }, response: new Response(null, { status: 401 }) });

describe('fetchAuthMe', () => {
  it('returns the unwrapped session payload on success', async () => {
    const authControllerMe = vi.fn().mockResolvedValue(ok({ principal: { subject: 's1' } }));
    await expect(fetchAuthMe({ authControllerMe } as never, {})).resolves.toEqual({ principal: { subject: 's1' } });
  });

  it('returns null when the request fails', async () => {
    const authControllerMe = vi.fn().mockResolvedValue(fail());
    await expect(fetchAuthMe({ authControllerMe } as never, {})).resolves.toBeNull();
  });
});

describe('createAuthSession', () => {
  it('logs in with the mapped string credentials', async () => {
    const authControllerLogin = vi.fn().mockResolvedValue(ok({ principal: { subject: 's1' } }));
    const authControllerRegister = vi.fn();
    const input = { email: 'a@example.com', mode: AuthMode.Login, password: 'secret' };

    await expect(
      createAuthSession({ authControllerLogin, authControllerRegister } as never, {}, input, 'en'),
    ).resolves.toEqual({ principal: { subject: 's1' } });
    expect(authControllerLogin).toHaveBeenCalledWith({ email: 'a@example.com', password: 'secret' }, {});
    expect(authControllerRegister).not.toHaveBeenCalled();
  });

  it('coerces non-string form values to empty strings on login', async () => {
    const authControllerLogin = vi.fn().mockResolvedValue(ok({}));
    await createAuthSession(
      { authControllerLogin } as never,
      {},
      { email: null, mode: AuthMode.Login, password: null },
      'en',
    );
    expect(authControllerLogin).toHaveBeenCalledWith({ email: '', password: '' }, {});
  });

  it('registers with an optional display name', async () => {
    const authControllerRegister = vi.fn().mockResolvedValue(ok({ principal: { subject: 's2' } }));
    const withName = { displayName: 'Ada', email: 'a@example.com', mode: AuthMode.Register, password: 'secret' };

    await createAuthSession({ authControllerRegister } as never, {}, withName, 'ru');
    expect(authControllerRegister).toHaveBeenCalledWith(
      { displayName: 'Ada', email: 'a@example.com', locale: 'ru', password: 'secret' },
      {},
    );
  });

  it('registers with an undefined display name when none is provided', async () => {
    const authControllerRegister = vi.fn().mockResolvedValue(ok({}));
    await createAuthSession(
      { authControllerRegister } as never,
      {},
      { email: 'a@example.com', mode: AuthMode.Register, password: 'secret' },
      'en',
    );
    expect(authControllerRegister).toHaveBeenCalledWith(
      { displayName: undefined, email: 'a@example.com', locale: 'en', password: 'secret' },
      {},
    );
  });
});

describe('authMeQueryKey', () => {
  it('is the auth-client query-key helper', () => {
    expect(typeof authMeQueryKey).toBe('function');
    expect(Array.isArray(authMeQueryKey())).toBe(true);
  });
});
