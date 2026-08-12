// @requirements REQ-AUTH-ACCESS-001
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedTheme, DefaultAuthTenantId, type Language } from '@app/backend-feature-auth-shared';
import { InMemoryAuthUserStore, PostgresAuthUserStore, toAuthUserRecord, type AuthUserRecord } from './auth-user-store';

const record: AuthUserRecord = {
  id: 'user-id',
  tenantId: DefaultAuthTenantId,
  email: 'user@example.com',
  displayName: null,
  passwordHash: 'hash',
  roles: ['user'],
  permissions: ['profile:read'],
  locale: null,
  theme: AuthenticatedTheme.System,
  status: 'active',
  lastLoginAt: null,
  avatarUrl: null,
  avatarHash: null,
  avatarStatus: 'none',
  emailVerifiedAt: null,
  credentialRevision: 0,
};

describe('auth user stores', () => {
  it('maps Postgres repository records and null lookups', async () => {
    const repository = {
      createUser: vi.fn(() => okAsync(record)),
      findByEmail: vi.fn((email: string) => okAsync(email === record.email ? record : null)),
      findById: vi.fn((id: string) => okAsync(id === record.id ? record : null)),
      setLocale: vi.fn((id: string, locale: Language) => okAsync(id === record.id ? { ...record, locale } : null)),
      setPreferences: vi.fn(
        (
          id: string,
          preferences: {
            locale?: Language;
            theme?: AuthenticatedTheme;
          },
        ) => okAsync(id === record.id ? { ...record, ...preferences } : null),
      ),
      recordLogin: vi.fn((id: string, loggedInAt?: Date) =>
        okAsync(id === record.id ? { ...record, lastLoginAt: loggedInAt ?? null } : null),
      ),
    };
    const store = new PostgresAuthUserStore(repository as never);
    const loggedInAt = new Date('2026-01-01T00:00:00.000Z');

    expect((await store.create(record))._unsafeUnwrap()).toEqual(record);
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toEqual(record);
    expect((await store.findByEmail('missing@example.com'))._unsafeUnwrap()).toBeNull();
    expect((await store.findById(record.id))._unsafeUnwrap()).toEqual(record);
    expect((await store.findById('missing'))._unsafeUnwrap()).toBeNull();
    expect((await store.setLocale(record.id, 'ru'))._unsafeUnwrap()).toMatchObject({ locale: 'ru' });
    expect((await store.setLocale('missing', 'ru'))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await store.setPreferences(record.id, {
          locale: 'en',
          theme: AuthenticatedTheme.Dark,
        })
      )._unsafeUnwrap(),
    ).toMatchObject({ locale: 'en', theme: 'dark' });
    expect((await store.recordLogin(record.id, loggedInAt))._unsafeUnwrap()).toMatchObject({ lastLoginAt: loggedInAt });
    expect((await store.recordLogin('missing'))._unsafeUnwrap()).toBeNull();
  });

  it('passes repository errors through Postgres store methods', async () => {
    const error = { code: 'repository_error' as const, message: 'boom' };
    const repository = {
      createUser: vi.fn(() => errAsync(error)),
      findByEmail: vi.fn(() => errAsync(error)),
      findById: vi.fn(() => errAsync(error)),
      setLocale: vi.fn(() => errAsync(error)),
      setPreferences: vi.fn(() => errAsync(error)),
      recordLogin: vi.fn(() => errAsync(error)),
    };
    const store = new PostgresAuthUserStore(repository as never);

    expect((await store.create(record))._unsafeUnwrapErr()).toEqual(error);
    expect((await store.findByEmail(record.email))._unsafeUnwrapErr()).toEqual(error);
    expect((await store.findById(record.id))._unsafeUnwrapErr()).toEqual(error);
    expect((await store.setLocale(record.id, 'ru'))._unsafeUnwrapErr()).toEqual(error);
    expect(
      (
        await store.setPreferences(record.id, {
          theme: AuthenticatedTheme.Light,
        })
      )._unsafeUnwrapErr(),
    ).toEqual(error);
    expect((await store.recordLogin(record.id))._unsafeUnwrapErr()).toEqual(error);
  });

  it('stores in-memory users, rejects duplicates, and handles missing logins', async () => {
    const store = new InMemoryAuthUserStore();
    const created = (await store.create(record))._unsafeUnwrap();
    const loggedInAt = new Date('2026-01-01T00:00:00.000Z');

    expect(created).toMatchObject({
      email: record.email,
      displayName: null,
      roles: ['user'],
      status: 'active',
      locale: null,
      theme: record.theme,
      lastLoginAt: null,
    });
    expect((await store.create(record))._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Email already exists for tenant.',
    });
    expect((await store.findByEmail(null))._unsafeUnwrap()).toBeNull();
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toEqual(created);
    (store as unknown as { usersById: Map<string, AuthUserRecord> }).usersById.delete(created.id);
    expect((await store.findByEmail(record.email))._unsafeUnwrap()).toBeNull();
    (store as unknown as { usersById: Map<string, AuthUserRecord> }).usersById.set(created.id, created);
    expect((await store.findByEmail('missing@example.com'))._unsafeUnwrap()).toBeNull();
    expect((await store.findById(created.id))._unsafeUnwrap()).toEqual(created);
    expect((await store.findById('missing'))._unsafeUnwrap()).toBeNull();
    expect((await store.setLocale(created.id, 'ru'))._unsafeUnwrap()).toMatchObject({ locale: 'ru' });
    expect((await store.setLocale('missing', 'ru'))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await store.setPreferences(created.id, {
          theme: AuthenticatedTheme.Dark,
        })
      )._unsafeUnwrap(),
    ).toMatchObject({ theme: 'dark' });
    expect((await store.recordLogin(created.id, loggedInAt))._unsafeUnwrap()).toMatchObject({
      lastLoginAt: loggedInAt,
    });
    expect((await store.recordLogin('missing'))._unsafeUnwrap()).toBeNull();
  });

  it('records email verification and bumps the credential revision on password replacement', async () => {
    const store = new InMemoryAuthUserStore();
    const created = (await store.create(record))._unsafeUnwrap();
    expect(created).toMatchObject({ emailVerifiedAt: null, credentialRevision: 0 });

    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');
    expect((await store.verifyEmail(created.id, created.tenantId, verifiedAt))._unsafeUnwrap()).toMatchObject({
      emailVerifiedAt: verifiedAt,
    });
    expect((await store.verifyEmail('missing'))._unsafeUnwrap()).toBeNull();

    expect((await store.replacePassword(created.id, 'next-hash', created.tenantId))._unsafeUnwrap()).toMatchObject({
      passwordHash: 'next-hash',
      credentialRevision: 1,
    });
    expect((await store.replacePassword(created.id, 'third-hash'))._unsafeUnwrap()).toMatchObject({
      credentialRevision: 2,
    });
    expect((await store.replacePassword('missing', 'next-hash'))._unsafeUnwrap()).toBeNull();
  });

  it('delegates recovery writes to the Postgres repository', async () => {
    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');
    const repository = {
      verifyEmail: vi.fn(() => okAsync({ ...record, emailVerifiedAt: verifiedAt })),
      replacePassword: vi.fn(() => okAsync({ ...record, passwordHash: 'next-hash', credentialRevision: 4 })),
    };
    const store = new PostgresAuthUserStore(repository as never);

    expect((await store.verifyEmail(record.id, record.tenantId, verifiedAt))._unsafeUnwrap()).toMatchObject({
      emailVerifiedAt: verifiedAt,
    });
    expect(repository.verifyEmail).toHaveBeenCalledWith(record.id, record.tenantId, verifiedAt);
    expect((await store.replacePassword(record.id, 'next-hash'))._unsafeUnwrap()).toMatchObject({
      passwordHash: 'next-hash',
      credentialRevision: 4,
    });
    expect(repository.replacePassword).toHaveBeenCalledWith(record.id, 'next-hash', DefaultAuthTenantId);
  });

  it('maps repository entities to auth user records', () => {
    expect(toAuthUserRecord(record)).toEqual(record);
  });

  it('defaults the recovery columns for adapters that predate them', () => {
    const { emailVerifiedAt: _verified, credentialRevision: _revision, ...legacy } = record;

    expect(toAuthUserRecord(legacy)).toMatchObject({ emailVerifiedAt: null, credentialRevision: 0 });
  });

  it('defaults missing tenant and invalid theme values when mapping records', () => {
    expect(
      toAuthUserRecord({
        ...record,
        tenantId: null,
        theme: 'unknown',
      }),
    ).toMatchObject({
      tenantId: DefaultAuthTenantId,
      theme: AuthenticatedTheme.System,
    });
  });

  it('synchronizes changed provider avatars and respects tenant isolation', async () => {
    const store = new InMemoryAuthUserStore();
    const created = (await store.create(record))._unsafeUnwrap();
    const first = (
      await store.syncProviderAvatar(created.id, {
        url: 'https://cdn.example.test/avatar.png',
        hash: 'hash-1',
      })
    )._unsafeUnwrap();

    expect(first).toMatchObject({
      avatarUrl: 'https://cdn.example.test/avatar.png',
      avatarHash: 'hash-1',
      avatarStatus: 'provider',
    });
    expect(
      (
        await store.syncProviderAvatar(
          created.id,
          { url: 'https://cdn.example.test/other.png', hash: 'hash-1' },
          created.tenantId,
        )
      )._unsafeUnwrap(),
    ).toEqual(first);
    expect(
      (
        await store.syncProviderAvatar(
          created.id,
          { url: 'https://cdn.example.test/avatar.png', hash: 'hash-2' },
          'other-tenant',
        )
      )._unsafeUnwrap(),
    ).toBeNull();
  });

  it.each(['manual', 'deleted'] as const)(
    'does not overwrite %s avatar choices during provider sync',
    async (avatarStatus) => {
      const store = new InMemoryAuthUserStore();
      const created = (await store.create(record))._unsafeUnwrap();
      const chosen = {
        ...created,
        avatarUrl: avatarStatus === 'manual' ? 'https://cdn.example.test/manual.png' : null,
        avatarHash: avatarStatus === 'manual' ? 'manual-hash' : null,
        avatarStatus,
      };
      (store as unknown as { usersById: Map<string, AuthUserRecord> }).usersById.set(created.id, chosen);

      expect(
        (
          await store.syncProviderAvatar(created.id, {
            url: 'https://provider.example.test/avatar.png',
            hash: 'provider-hash',
          })
        )._unsafeUnwrap(),
      ).toEqual(chosen);
    },
  );
});
