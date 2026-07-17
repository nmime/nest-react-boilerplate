import { afterEach, describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import {
  AuthProvider,
  AuthProviderChannel,
  DefaultAuthTenantId,
  ExternalAuthIntent,
} from '@app/backend-feature-auth-shared';
import type { ProviderTokenCrypto } from '@app/backend-postgres-main-auth';
import { InMemorySocialAuthStore, PostgresSocialAuthStore, type ExternalIdentityRecord } from './social-auth-store';

const tenantId = DefaultAuthTenantId;
const otherTenantId = '22222222-2222-4222-8222-222222222222';

const identityEntity: ExternalIdentityRecord = {
  id: 'identity-id',
  tenantId,
  userId: 'user-id',
  provider: AuthProvider.Telegram,
  providerSubject: '42',
  channel: AuthProviderChannel.TelegramBot,
  profileMetadata: { source: 'telegram_bot' },
  email: null,
  emailVerified: null,
  locale: null,
  avatarUrl: null,
  displayName: 'Ada',
  username: 'ada',
  lastAuthenticatedAt: null,
  linkedAt: new Date('2026-06-14T12:00:00.000Z'),
};

const methodEntity = {
  id: 'method-id',
  tenantId,
  userId: 'user-id',
  method: AuthProviderChannel.TelegramBot,
  amr: ['telegram'],
  externalIdentityId: 'identity-id',
  lastUsedAt: null,
};

const linkTokenEntity = {
  id: 'link-token-id',
  tenantId,
  userId: 'user-id',
  provider: AuthProvider.Telegram,
  purpose: ExternalAuthIntent.Link,
  tokenHash: 'hash',
  nonce: null,
  deepLinkMetadata: {},
  expiresAt: new Date('2026-06-14T12:10:00.000Z'),
  consumedAt: null,
  revokedAt: null,
};

function createRepositories() {
  return {
    identities: {
      findByProviderSubject: vi.fn((): ResultAsync<ExternalIdentityRecord | null, never> => okAsync(identityEntity)),
      findByUser: vi.fn(() => okAsync([identityEntity])),
      upsertIdentity: vi.fn(() => okAsync(identityEntity)),
      deleteById: vi.fn(() => okAsync(true)),
    },
    methods: {
      upsertMethod: vi.fn(() => okAsync(methodEntity)),
      findByUser: vi.fn(() => okAsync([methodEntity])),
      countUsableMethodsForUser: vi.fn(() => okAsync(2)),
    },
    linkTokens: {
      createToken: vi.fn(() => okAsync(linkTokenEntity)),
      consumeToken: vi.fn((): ResultAsync<typeof linkTokenEntity | null, never> => okAsync(linkTokenEntity)),
      revokeToken: vi.fn(() => okAsync(true)),
    },
    providerTokens: {
      persistEncryptedToken: vi.fn(() => okAsync({ id: 'token-id' })),
      listRedactedByExternalIdentity: vi.fn(
        (): ResultAsync<Array<{ id: string; revokedAt: Date | null }>, { code: string; message: string }> =>
          okAsync([
            { id: 'token-1', revokedAt: null },
            { id: 'token-2', revokedAt: new Date() },
          ]),
      ),
      revokeToken: vi.fn((): ResultAsync<boolean, { code: string; message: string }> => okAsync(true)),
    },
  };
}

const encryptSpy = vi.fn(() => ({
  ciphertext: 'cipher',
  iv: 'iv',
  authTag: 'tag',
  keyId: 'test-key',
}));
const crypto: ProviderTokenCrypto = {
  encrypt: encryptSpy,
  decrypt: vi.fn(() => 'plaintext'),
};

function createStore(cryptoOverride?: ProviderTokenCrypto) {
  const repositories = createRepositories();
  const store = new PostgresSocialAuthStore(
    repositories.identities as never,
    repositories.methods as never,
    repositories.linkTokens as never,
    repositories.providerTokens as never,
    cryptoOverride,
  );
  return { repositories, store };
}

describe('PostgresSocialAuthStore', () => {
  afterEach(() => {
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED;
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID;
    delete process.env.AUTH_PROVIDER_TOKEN_KEY_ID;
    vi.clearAllMocks();
  });

  it('delegates identity, method, and link-token lookups to repositories scoped by tenant', async () => {
    const { repositories, store } = createStore(crypto);

    expect((await store.findIdentity(AuthProvider.Telegram, '42', tenantId))._unsafeUnwrap()).toMatchObject({
      id: 'identity-id',
      providerSubject: '42',
    });
    expect(repositories.identities.findByProviderSubject).toHaveBeenCalledWith(AuthProvider.Telegram, '42', tenantId);

    expect((await store.listIdentities('user-id', tenantId))._unsafeUnwrap()).toHaveLength(1);
    expect((await store.upsertIdentity(identityEntity))._unsafeUnwrap()).toMatchObject({ id: 'identity-id' });
    expect((await store.deleteIdentity('identity-id', 'user-id', tenantId))._unsafeUnwrap()).toBe(true);

    expect(
      (
        await store.upsertMethod({
          tenantId,
          userId: 'user-id',
          method: AuthProviderChannel.TelegramBot,
          amr: ['telegram'],
        })
      )._unsafeUnwrap(),
    ).toMatchObject({ id: 'method-id' });
    expect((await store.listMethods('user-id', tenantId))._unsafeUnwrap()).toHaveLength(1);
    expect((await store.countMethods('user-id', tenantId))._unsafeUnwrap()).toBe(2);

    expect(
      (
        await store.createLinkToken({
          tenantId,
          userId: 'user-id',
          provider: AuthProvider.Telegram,
          purpose: ExternalAuthIntent.Link,
          tokenHash: 'hash',
          expiresAt: linkTokenEntity.expiresAt,
        })
      )._unsafeUnwrap(),
    ).toMatchObject({ id: 'link-token-id' });
    expect((await store.consumeLinkToken('hash', ExternalAuthIntent.Link, tenantId))._unsafeUnwrap()).toMatchObject({
      id: 'link-token-id',
    });
    expect((await store.revokeLinkToken('hash', tenantId))._unsafeUnwrap()).toBe(true);
  });

  it('returns null when repositories report no identity or link token', async () => {
    const { repositories, store } = createStore(crypto);
    repositories.identities.findByProviderSubject.mockReturnValueOnce(okAsync(null));
    repositories.linkTokens.consumeToken.mockReturnValueOnce(okAsync(null));

    expect((await store.findIdentity(AuthProvider.Telegram, 'unknown', tenantId))._unsafeUnwrap()).toBeNull();
    expect(
      (await store.consumeLinkToken('missing', ExternalAuthIntent.Link, tenantId, new Date()))._unsafeUnwrap(),
    ).toBeNull();
  });

  it('encrypts provider tokens with tenant-scoped AAD before persistence', async () => {
    const { repositories, store } = createStore(crypto);

    const persisted = await store.persistProviderToken({
      tenantId,
      userId: 'user-id',
      externalIdentityId: 'identity-id',
      provider: AuthProvider.Discord,
      tokenKind: 'access',
      plaintext: 'secret-access-token',
      scopes: ['identify'],
      expiresAt: null,
    });

    expect(persisted._unsafeUnwrap()).toBe(true);
    expect(encryptSpy).toHaveBeenCalledWith({
      plaintext: 'secret-access-token',
      aad: `${tenantId}:user-id:identity-id:${AuthProvider.Discord}:access`,
    });
    expect(repositories.providerTokens.persistEncryptedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        ciphertext: 'cipher',
        keyId: 'test-key',
        tenantId,
        userId: 'user-id',
        tokenKind: 'access',
      }),
    );
  });

  it('skips persistence and returns false when no crypto is configured', async () => {
    const { repositories, store } = createStore();

    expect(
      (
        await store.persistProviderToken({
          tenantId,
          userId: 'user-id',
          externalIdentityId: 'identity-id',
          provider: AuthProvider.Discord,
          tokenKind: 'access',
          plaintext: 'secret',
        })
      )._unsafeUnwrap(),
    ).toBe(false);
    expect(repositories.providerTokens.persistEncryptedToken).not.toHaveBeenCalled();
  });

  it('revokes only unrevoked provider tokens and counts successful revocations', async () => {
    const { repositories, store } = createStore(crypto);
    repositories.providerTokens.listRedactedByExternalIdentity.mockReturnValueOnce(
      okAsync([
        { id: 'token-1', revokedAt: null },
        { id: 'token-2', revokedAt: null },
        { id: 'token-3', revokedAt: new Date() },
      ]),
    );
    repositories.providerTokens.revokeToken
      .mockReturnValueOnce(okAsync(true))
      .mockReturnValueOnce(errAsync({ code: 'x', message: 'revoke failed' }));

    const revoked = await store.revokeProviderTokens('identity-id', tenantId);

    expect(revoked._unsafeUnwrap()).toBe(1);
    expect(repositories.providerTokens.revokeToken).toHaveBeenCalledTimes(2);
  });

  it('maps provider-token listing failures to repository errors', async () => {
    const { repositories, store } = createStore(crypto);
    repositories.providerTokens.listRedactedByExternalIdentity.mockReturnValueOnce(
      errAsync({ code: 'repository_error', message: 'list failed' }),
    );

    expect((await store.revokeProviderTokens('identity-id', tenantId))._unsafeUnwrapErr().message).toBe('list failed');
  });

  it('maps provider-token revoke promise failures with fallback messages', async () => {
    const { repositories, store } = createStore(crypto);
    repositories.providerTokens.listRedactedByExternalIdentity.mockReturnValueOnce(
      okAsync([{ id: 'token-1', revokedAt: null }]),
    );
    const nonErrorRejection = {
      match: () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- covers fallback mapping for non-Error promise rejection reasons.
        Promise.reject('boom'),
    };
    repositories.providerTokens.revokeToken.mockReturnValueOnce(
      nonErrorRejection as unknown as ReturnType<typeof repositories.providerTokens.revokeToken>,
    );

    expect((await store.revokeProviderTokens('identity-id', tenantId))._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Provider token revoke failed.',
    });

    repositories.providerTokens.listRedactedByExternalIdentity.mockReturnValueOnce(
      okAsync([{ id: 'token-2', revokedAt: null }]),
    );
    const errorRejection = {
      match: () => Promise.reject(new Error('revoke exploded')),
    };
    repositories.providerTokens.revokeToken.mockReturnValueOnce(
      errorRejection as unknown as ReturnType<typeof repositories.providerTokens.revokeToken>,
    );
    expect((await store.revokeProviderTokens('identity-id', tenantId))._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'revoke exploded',
    });
  });
});

describe('PostgresSocialAuthStore env-derived crypto', () => {
  afterEach(() => {
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED;
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID;
    delete process.env.AUTH_PROVIDER_TOKEN_KEY_ID;
  });

  async function persist(store: PostgresSocialAuthStore) {
    return store.persistProviderToken({
      tenantId,
      userId: 'user-id',
      externalIdentityId: 'identity-id',
      provider: AuthProvider.Discord,
      tokenKind: 'access',
      plaintext: 'plaintext-secret',
    });
  }

  it('disables encryption when the feature flag is off', async () => {
    const { repositories, store } = createStore();
    expect((await persist(store))._unsafeUnwrap()).toBe(false);
    expect(repositories.providerTokens.persistEncryptedToken).not.toHaveBeenCalled();
  });

  it('disables encryption when no key is present', async () => {
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED = 'true';
    const { repositories, store } = createStore();
    expect((await persist(store))._unsafeUnwrap()).toBe(false);
    expect(repositories.providerTokens.persistEncryptedToken).not.toHaveBeenCalled();
  });

  it('disables encryption when the key is not 32 bytes', async () => {
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED = 'true';
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY = 'abcd';
    const { repositories, store } = createStore();
    expect((await persist(store))._unsafeUnwrap()).toBe(false);
    expect(repositories.providerTokens.persistEncryptedToken).not.toHaveBeenCalled();
  });

  it('builds an AES-GCM crypto from a hex key and honors a configured key id', async () => {
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED = 'true';
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY = '0'.repeat(64);
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID = 'primary';
    const { repositories, store } = createStore();

    expect((await persist(store))._unsafeUnwrap()).toBe(true);
    expect(repositories.providerTokens.persistEncryptedToken).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'primary' }),
    );
  });

  it('builds an AES-GCM crypto from a base64 key and defaults the key id', async () => {
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED = 'true';
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');
    const { repositories, store } = createStore();

    expect((await persist(store))._unsafeUnwrap()).toBe(true);
    expect(repositories.providerTokens.persistEncryptedToken).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'env' }),
    );
  });
});

describe('InMemorySocialAuthStore', () => {
  it('lists identities and enforces owner and tenant scoping on delete', async () => {
    const store = new InMemorySocialAuthStore();
    const created = (
      await store.upsertIdentity({
        tenantId,
        userId: 'owner',
        provider: AuthProvider.Telegram,
        providerSubject: '100',
        channel: AuthProviderChannel.TelegramBot,
      })
    )._unsafeUnwrap();

    expect((await store.listIdentities('owner', tenantId))._unsafeUnwrap()).toHaveLength(1);
    expect((await store.listIdentities('owner', otherTenantId))._unsafeUnwrap()).toHaveLength(0);
    (
      store as unknown as {
        identitiesById: Map<string, ExternalIdentityRecord>;
      }
    ).identitiesById.delete(created.id);
    expect((await store.findIdentity(AuthProvider.Telegram, '100', tenantId))._unsafeUnwrap()).toBeNull();
    (
      store as unknown as {
        identitiesById: Map<string, ExternalIdentityRecord>;
      }
    ).identitiesById.set(created.id, created);

    expect((await store.deleteIdentity(created.id, 'not-owner', tenantId))._unsafeUnwrap()).toBe(false);
    expect((await store.deleteIdentity(created.id, 'owner', otherTenantId))._unsafeUnwrap()).toBe(false);
    expect((await store.deleteIdentity(created.id, 'owner', tenantId))._unsafeUnwrap()).toBe(true);
  });

  it('refuses to revoke a link token that is already consumed', async () => {
    const store = new InMemorySocialAuthStore();
    const now = new Date('2026-06-14T12:00:00.000Z');
    await store.createLinkToken({
      tenantId,
      userId: 'owner',
      provider: AuthProvider.Telegram,
      purpose: ExternalAuthIntent.Link,
      tokenHash: 'consumable-hash',
      expiresAt: new Date('2026-06-14T12:10:00.000Z'),
    });

    await store.consumeLinkToken('consumable-hash', ExternalAuthIntent.Link, tenantId, now);

    expect((await store.revokeLinkToken('consumable-hash', tenantId, now))._unsafeUnwrap()).toBe(false);
    expect((await store.revokeLinkToken('missing-hash', tenantId, now))._unsafeUnwrap()).toBe(false);
  });

  it('updates existing methods and stores nullable link-token users', async () => {
    const store = new InMemorySocialAuthStore();
    const first = (
      await store.upsertMethod({
        tenantId,
        userId: 'owner',
        method: AuthProviderChannel.TelegramBot,
        amr: ['telegram'],
        externalIdentityId: null,
        lastUsedAt: null,
      })
    )._unsafeUnwrap();
    const usedAt = new Date('2026-06-14T12:05:00.000Z');
    const second = (
      await store.upsertMethod({
        tenantId,
        userId: 'owner',
        method: AuthProviderChannel.TelegramBot,
        amr: ['telegram'],
        lastUsedAt: usedAt,
      })
    )._unsafeUnwrap();

    expect(second.id).toBe(first.id);
    expect(second.lastUsedAt).toBe(usedAt);

    const link = (
      await store.createLinkToken({
        tenantId,
        provider: AuthProvider.Telegram,
        purpose: ExternalAuthIntent.Link,
        tokenHash: 'anonymous-link',
        nonce: ' nonce ',
        expiresAt: new Date('2026-06-14T12:10:00.000Z'),
      })
    )._unsafeUnwrap();
    expect(link).toMatchObject({ nonce: 'nonce', userId: null });
    expect(
      (await store.consumeLinkToken('missing-link', ExternalAuthIntent.Link, tenantId))._unsafeUnwrap(),
    ).toBeNull();
  });
});
