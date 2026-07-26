// @requirements REQ-AUTH-IDENTITY-005
import { describe, expect, it } from 'vitest';
import {
  getProviderTranslationKey,
  normalizeProviderIdentities,
  normalizeProviderIdentity,
  socialAuthProviders,
  SocialAuthProvider,
} from './index';

describe('getProviderTranslationKey / socialAuthProviders', () => {
  it('maps providers to translation keys in a stable order', () => {
    expect(getProviderTranslationKey(SocialAuthProvider.Discord)).toBe('auth.provider.discord');
    expect(getProviderTranslationKey(SocialAuthProvider.Telegram)).toBe('auth.provider.telegram');
    expect(socialAuthProviders).toEqual([SocialAuthProvider.Telegram, SocialAuthProvider.Discord]);
  });
});

describe('normalizeProviderIdentity', () => {
  it('returns null for non-records, missing ids, and unknown providers', () => {
    expect(normalizeProviderIdentity(null)).toBeNull();
    expect(normalizeProviderIdentity('nope')).toBeNull();
    expect(normalizeProviderIdentity({ provider: 'discord' })).toBeNull();
    expect(normalizeProviderIdentity({ id: 'i1', provider: 'myspace' })).toBeNull();
  });

  it('normalizes a full identity using canonical field names', () => {
    expect(
      normalizeProviderIdentity({
        id: 'i1',
        provider: 'discord',
        providerSubject: 'sub',
        username: 'ada',
        displayName: 'Ada',
        email: 'a@example.com',
        avatarUrl: 'https://x/a.png',
        isLastMethod: true,
        linkedAt: '2026-01-01',
      }),
    ).toEqual({
      avatarUrl: 'https://x/a.png',
      displayName: 'Ada',
      email: 'a@example.com',
      id: 'i1',
      isLastMethod: true,
      linkedAt: '2026-01-01',
      provider: SocialAuthProvider.Discord,
      providerSubject: 'sub',
      username: 'ada',
    });
  });

  it('accepts alternate field names and coerces blank/invalid values', () => {
    expect(
      normalizeProviderIdentity({
        identityId: 'i2',
        authProvider: 'telegram',
        name: 'Bob',
        subject: 'sub2',
        lastMethod: 'not-a-boolean',
        createdAt: '   ',
      }),
    ).toEqual({
      avatarUrl: undefined,
      displayName: 'Bob',
      email: null,
      id: 'i2',
      isLastMethod: undefined,
      linkedAt: undefined,
      provider: SocialAuthProvider.Telegram,
      providerSubject: 'sub2',
      username: undefined,
    });
  });
});

describe('normalizeProviderIdentities', () => {
  it('reads identities from arrays and known container keys, skipping invalid entries', () => {
    const fromArray = normalizeProviderIdentities([{ id: 'i1', provider: 'discord' }, { bogus: true }]);
    expect(fromArray.identities).toHaveLength(1);
    expect(fromArray.providers[SocialAuthProvider.Discord]?.id).toBe('i1');
    expect(fromArray.providers[SocialAuthProvider.Telegram]).toBeNull();

    expect(normalizeProviderIdentities({ items: [{ id: 'i2', provider: 'telegram' }] }).identities).toHaveLength(1);
    expect(normalizeProviderIdentities({ nothing: true }).identities).toEqual([]);
    expect(normalizeProviderIdentities(null).identities).toEqual([]);
  });
});
