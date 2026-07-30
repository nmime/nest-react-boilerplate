// @requirements REQ-AUTH-SESSION-002
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BetterAuthTelegramSessionService, toBetterAuthHeaders } from './better-auth-telegram-session.service';

const createService = (session: unknown, accounts: unknown[]) => {
  const betterAuth = {
    api: {
      getSession: vi.fn().mockResolvedValue(session),
      listUserAccounts: vi.fn().mockResolvedValue(accounts),
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
});

describe(toBetterAuthHeaders.name, () => {
  it('ignores absent values and preserves scalar headers', () => {
    const headers = toBetterAuthHeaders({ cookie: 'session=one', ignored: undefined });
    expect(headers.get('cookie')).toBe('session=one');
    expect(headers.has('ignored')).toBe(false);
  });
});
