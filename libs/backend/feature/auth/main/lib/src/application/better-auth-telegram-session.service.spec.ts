// @requirements REQ-AUTH-SESSION-002
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BetterAuthTelegramSessionService, toBetterAuthHeaders } from './better-auth-telegram-session.service';

const createService = (session: unknown, accounts: unknown[]) => {
  const betterAuth = {
    api: {
      getSession: vi.fn().mockResolvedValue(session),
      listUserAccounts: vi.fn().mockResolvedValue(accounts),
      signOut: vi.fn().mockResolvedValue(new Response('{}')),
    },
  };
  return { betterAuth, service: new BetterAuthTelegramSessionService(betterAuth as never) };
};

describe(BetterAuthTelegramSessionService.name, () => {
  it('forwards incoming cookies and maps the verified Telegram account', async () => {
    const { betterAuth, service } = createService(
      { user: { id: 'user-id', image: ' https://cdn.example.test/ada.png ', name: ' Ada Lovelace ' } },
      [{ accountId: '777', providerId: 'telegram' }],
    );

    await expect(
      service.requireTelegramProfile({ cookie: ['better-auth.session_token=one', 'other=two'] }),
    ).resolves.toEqual({
      avatarUrl: 'https://cdn.example.test/ada.png',
      displayName: 'Ada Lovelace',
      providerSubject: '777',
    });
    expect(betterAuth.api.getSession).toHaveBeenCalledWith({
      headers: expect.objectContaining({}),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const { headers } = betterAuth.api.getSession.mock.calls[0]?.[0] as { headers: Headers };
    expect(headers.get('cookie')).toBe('better-auth.session_token=one, other=two');
  });

  it('rejects a missing Better Auth session', async () => {
    const { service } = createService(null, []);

    await expect(service.requireTelegramProfile({})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session that has no numeric Telegram account', async () => {
    const missing = createService({ user: { id: 'user-id' } }, [{ accountId: 'discord-id', providerId: 'discord' }]);
    const invalid = createService({ user: { id: 'user-id' } }, [{ accountId: 'invalid', providerId: 'telegram' }]);

    await expect(missing.service.requireTelegramProfile({})).rejects.toThrow('telegram_better_auth_account_required');
    await expect(invalid.service.requireTelegramProfile({})).rejects.toThrow('telegram_better_auth_account_required');
  });

  it('returns every clearing cookie only after the original credential is revoked', async () => {
    const { betterAuth, service } = createService(null, []);
    const headers = new Headers();
    headers.append('set-cookie', 'better-auth.session_token=; Max-Age=0; Path=/');
    headers.append('set-cookie', 'better-auth.session_data=; Max-Age=0; Path=/');
    betterAuth.api.signOut.mockResolvedValueOnce(new Response('{}', { headers }));

    await expect(service.revokeSession({ cookie: 'better-auth.session_token=original' })).resolves.toEqual(
      headers.getSetCookie(),
    );
    expect(betterAuth.api.signOut).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { disableRedirect: true },
      asResponse: true,
    });
    expect(betterAuth.api.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const incoming = betterAuth.api.getSession.mock.calls[0]?.[0] as { headers: Headers };
    expect(incoming.headers.get('cookie')).toContain('original');
  });

  it('does not accept signOut success when the server still stores the original session', async () => {
    const { service } = createService({ user: { id: 'retained' }, session: { id: 'retained-session' } }, []);
    await expect(service.revokeSession({ cookie: 'better-auth.session_token=original' })).rejects.toThrow();
  });

  it('fails revocation on an unsuccessful response or unavailable authoritative store', async () => {
    const { betterAuth, service } = createService(null, []);
    betterAuth.api.signOut.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(service.revokeSession({})).rejects.toThrow();
    betterAuth.api.getSession.mockRejectedValueOnce(new Error('store unavailable'));
    await expect(service.revokeSession({})).rejects.toThrow('store unavailable');
  });
});

describe(toBetterAuthHeaders.name, () => {
  it('ignores absent values and preserves scalar headers', () => {
    const headers = toBetterAuthHeaders({ cookie: 'session=one', ignored: undefined });
    expect(headers.get('cookie')).toBe('session=one');
    expect(headers.has('ignored')).toBe(false);
  });
});
