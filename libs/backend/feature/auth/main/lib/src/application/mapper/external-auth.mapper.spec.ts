import { describe, expect, it } from 'vitest';
import { AuthProvider, AuthProviderChannel, DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { profileToIdentityInput, toIdentityView } from './external-auth.mapper';

describe('external auth mappers', () => {
  it('defaults missing profile metadata and maps authenticated timestamps', () => {
    expect(
      profileToIdentityInput(
        {
          provider: AuthProvider.Telegram,
          channel: AuthProviderChannel.TelegramWebLogin,
          providerSubject: '42',
        },
        DefaultAuthTenantId,
        'user-id',
      ),
    ).toMatchObject({
      avatarUrl: null,
      displayName: null,
      email: null,
      emailVerified: null,
      locale: null,
      profileMetadata: {},
      username: null,
    });

    expect(
      toIdentityView({
        id: 'identity-id',
        tenantId: DefaultAuthTenantId,
        userId: 'user-id',
        provider: AuthProvider.Telegram,
        providerSubject: '42',
        channel: AuthProviderChannel.TelegramWebLogin,
        email: null,
        emailVerified: null,
        displayName: null,
        username: null,
        avatarUrl: null,
        profileMetadata: {},
        linkedAt: new Date('2026-07-05T00:00:00.000Z'),
        lastAuthenticatedAt: new Date('2026-07-05T00:01:00.000Z'),
      }),
    ).toMatchObject({
      lastAuthenticatedAt: '2026-07-05T00:01:00.000Z',
      linkedAt: '2026-07-05T00:00:00.000Z',
    });
    expect(
      toIdentityView({
        id: 'identity-id',
        tenantId: DefaultAuthTenantId,
        userId: 'user-id',
        provider: AuthProvider.Telegram,
        providerSubject: '43',
        channel: AuthProviderChannel.TelegramWebLogin,
        email: null,
        emailVerified: null,
        displayName: null,
        username: null,
        avatarUrl: null,
        profileMetadata: {},
        linkedAt: new Date('2026-07-05T00:00:00.000Z'),
        lastAuthenticatedAt: null,
      }).lastAuthenticatedAt,
    ).toBeNull();
  });
});
