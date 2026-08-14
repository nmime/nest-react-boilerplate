// @requirements REQ-AUTH-PERSISTENCE-007
// Evidence for: REQ-AUTH-PERSISTENCE-007
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthUserEntity, DefaultAuthTenantId, type AuthUserEntityInput } from '../entities';
import { AuthUserRepository } from './auth-user.repository';

function createEntityManagerMock() {
  const create = vi.fn((_, input: AuthUserEntityInput) => {
    const entity = new AuthUserEntity(input);
    entity.id = 'user-id';
    return entity;
  });
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve<AuthUserEntity | null>(null));
  const execute = vi.fn((): Promise<Array<{ role_key: string | null; permission_key: string | null }>> =>
    Promise.resolve([]),
  );
  const entityManager = {
    create,
    persist,
    flush,
    findOne,
    getConnection: () => ({ execute }),
  } as unknown as EntityManager;
  // Runs the callback against the same manager, so a repository that wraps a read-modify-write in a
  // transaction is still observable through the plain findOne/flush spies.
  const transactional = vi.fn((handler: (manager: EntityManager) => unknown) => handler(entityManager));
  Object.assign(entityManager, { transactional });

  return { create, persist, flush, findOne, execute, transactional, entityManager };
}

describe('AuthUserRepository', () => {
  it('creates auth users through MikroORM', async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.createUser({
      email: 'user@example.com',
      displayName: 'User',
      permissions: ['profile:read'],
      roles: ['user'],
      locale: 'ru',
    });

    const entity = result._unsafeUnwrap();
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(entity).toMatchObject({
      email: 'user@example.com',
      displayName: 'User',
      permissions: [],
      roles: [],
      locale: 'ru',
      theme: 'system',
      status: 'active',
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('normalizes email to lowercase before persisting so findByEmail lookups match', async () => {
    const { entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.createUser({ email: '  Foo@Example.COM ' });

    expect(result._unsafeUnwrap().email).toBe('foo@example.com');
  });

  it('finds an auth user by email', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, execute, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    execute.mockResolvedValue([
      { role_key: 'admin', permission_key: 'admin:users:read' },
      { role_key: 'user', permission_key: 'profile:read' },
    ]);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findByEmail('user@example.com');

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(entity.roles).toEqual(['user', 'admin']);
    expect(entity.permissions).toEqual(['profile:read', 'admin:users:read']);
    expect(findOne).toHaveBeenCalledWith(AuthUserEntity, {
      tenantId: DefaultAuthTenantId,
      email: { $ne: null, $eq: 'user@example.com' },
    });
  });

  it('stamps the verification time and leaves the credential epoch alone', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);
    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');

    const result = await authUsers.verifyEmail('user-id', DefaultAuthTenantId, verifiedAt);

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(entity.emailVerifiedAt).toEqual(verifiedAt);
    expect(entity.credentialRevision).toBe(0);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('advances the credential epoch in the same write that replaces the password', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com', passwordHash: 'old-hash' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.replacePassword('user-id', 'new-hash', DefaultAuthTenantId);

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(entity.passwordHash).toBe('new-hash');
    expect(entity.credentialRevision).toBe(1);
    // One flush: a revision that lands without the new hash would revoke sessions for nothing,
    // and a hash that lands without the revision would leave stolen sessions alive.
    expect(flush).toHaveBeenCalledOnce();
  });

  it('reports a missing account for both recovery writes', async () => {
    const { entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    await expect(authUsers.verifyEmail('missing').then((result) => result._unsafeUnwrap())).resolves.toBeNull();
    await expect(
      authUsers.replacePassword('missing', 'new-hash').then((result) => result._unsafeUnwrap()),
    ).resolves.toBeNull();
  });

  it('returns null without querying for blank or null email', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    await expect(authUsers.findByEmail(null).then((result) => result._unsafeUnwrap())).resolves.toBeNull();
    await expect(authUsers.findByEmail('   ').then((result) => result._unsafeUnwrap())).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('finds an auth user by id', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findById('user-id');

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthUserEntity, {
      id: 'user-id',
      tenantId: DefaultAuthTenantId,
    });
  });

  it('lists and counts users with tenant-scoped allowlisted filters', async () => {
    const entity = new AuthUserEntity({ email: 'admin@example.com' });
    const { entityManager } = createEntityManagerMock();
    const find = vi.fn((_entity: unknown, _filter: unknown, _options?: unknown) => Promise.resolve([entity]));
    const count = vi.fn((_entity: unknown, _filter: unknown) => Promise.resolve(1));
    Object.assign(entityManager, { find, count });
    const authUsers = new AuthUserRepository(entityManager);

    await expect(
      authUsers
        .listUsers({
          limit: 10,
          offset: 5,
          permission: 'admin:users:read',
          role: 'admin',
          search: 'Ada_%',
          status: 'active',
          tenantId: 'tenant-id',
        })
        .then((result) => result._unsafeUnwrap()),
    ).resolves.toEqual([entity]);
    await expect(
      authUsers.countUsers({ role: 'admin', tenantId: 'tenant-id' }).then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(1);

    expect(find).toHaveBeenCalledWith(
      AuthUserEntity,
      expect.objectContaining({
        tenantId: 'tenant-id',
        $or: [{ email: { $ne: null, $ilike: '%Ada\\_\\%%' } }, { displayName: { $ilike: '%Ada\\_\\%%' } }],
        status: 'active',
      }),
      { limit: 10, offset: 5, orderBy: { createdAt: 'DESC', id: 'ASC' } },
    );
    const listFilter = find.mock.calls[0]?.[1];
    const countFilter = count.mock.calls[0]?.[1];
    expect(listFilter).not.toHaveProperty('roles');
    expect(listFilter).not.toHaveProperty('permissions');
    expect(count).toHaveBeenCalledWith(AuthUserEntity, expect.objectContaining({ tenantId: 'tenant-id' }));
    expect(countFilter).not.toHaveProperty('roles');
  });

  it('defensively caps and clamps pagination at repository level', async () => {
    const { entityManager } = createEntityManagerMock();
    const find = vi.fn(() => Promise.resolve([]));
    Object.assign(entityManager, { find });
    const authUsers = new AuthUserRepository(entityManager);

    await authUsers.listUsers({ limit: 1_000, offset: -10 });

    expect(find).toHaveBeenCalledWith(
      AuthUserEntity,
      { tenantId: DefaultAuthTenantId },
      { limit: 100, offset: 0, orderBy: { createdAt: 'DESC', id: 'ASC' } },
    );
  });

  it('updates a persisted auth user locale', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setLocale('user-id', 'ru');

    expect(result._unsafeUnwrap()).toMatchObject({ locale: 'ru' });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('updates a persisted auth user theme', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setPreferences('user-id', { theme: 'dark' });

    expect(result._unsafeUnwrap()).toMatchObject({ theme: 'dark' });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('maps repository errors when updating locale', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error('locale update failed'));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setLocale('user-id', 'ru');

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'locale update failed',
    });
  });

  it('maps repository errors when updating preferences', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error('preferences update failed'));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setPreferences('user-id', {
      theme: 'light',
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'preferences update failed',
    });
  });

  it('maps repository errors when recording login', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error('login update failed'));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.recordLogin('user-id');

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'login update failed',
    });
  });

  it('records last login time', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const loggedInAt = new Date('2026-01-01T00:00:00.000Z');
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.recordLogin('user-id', loggedInAt);

    expect(result._unsafeUnwrap()?.lastLoginAt).toBe(loggedInAt);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('stores a manual avatar over whatever the profile carried before', async () => {
    const entity = new AuthUserEntity({
      email: 'user@example.com',
      avatarStatus: 'provider',
      avatarUrl: 'https://cdn.example.com/provider.png',
      avatarHash: 'provider-hash',
    });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setAvatar('user-id', {
      url: 'https://cdn.example.com/manual.png',
      hash: 'manual-hash',
      status: 'manual',
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      avatarUrl: 'https://cdn.example.com/manual.png',
      avatarHash: 'manual-hash',
      avatarStatus: 'manual',
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // "deleted" and "none" are distinct on purpose: only the former tells a later provider sync that
  // the blank avatar is a decision rather than an absence.
  it('clears the avatar to the deleted status rather than back to none', async () => {
    const entity = new AuthUserEntity({
      email: 'user@example.com',
      avatarStatus: 'manual',
      avatarUrl: 'https://cdn.example.com/manual.png',
      avatarHash: 'manual-hash',
    });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.deleteAvatar('user-id');

    expect(result._unsafeUnwrap()).toMatchObject({
      avatarUrl: '',
      avatarHash: '',
      avatarStatus: 'deleted',
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('writes a provider avatar onto a profile that has none', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.syncProviderAvatar('user-id', {
      url: 'https://cdn.example.com/telegram.png',
      hash: 'telegram-hash',
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      avatarUrl: 'https://cdn.example.com/telegram.png',
      avatarHash: 'telegram-hash',
      avatarStatus: 'provider',
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // A provider that drops its picture sends null. Writing the empty URL back with a "provider"
  // status would claim an avatar the provider no longer has, so the status falls to "none".
  it('falls back to no avatar when the provider stops supplying one', async () => {
    const entity = new AuthUserEntity({
      email: 'user@example.com',
      avatarStatus: 'provider',
      avatarUrl: 'https://cdn.example.com/telegram.png',
      avatarHash: 'telegram-hash',
    });
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.syncProviderAvatar('user-id', { url: null, hash: null });

    expect(result._unsafeUnwrap()).toMatchObject({
      avatarUrl: '',
      avatarHash: '',
      avatarStatus: 'none',
    });
  });

  it.each(['manual', 'deleted'] as const)('leaves a %s avatar untouched on a provider sync', async (avatarStatus) => {
    const entity = new AuthUserEntity({
      email: 'user@example.com',
      avatarStatus,
      avatarUrl: 'https://cdn.example.com/chosen.png',
      avatarHash: 'chosen-hash',
    });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.syncProviderAvatar('user-id', {
      url: 'https://cdn.example.com/provider.png',
      hash: 'provider-hash',
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      avatarUrl: 'https://cdn.example.com/chosen.png',
      avatarHash: 'chosen-hash',
      avatarStatus,
    });
    expect(flush).not.toHaveBeenCalled();
  });

  // Providers re-send the same picture on every login, so an unchanged hash must not cost a write.
  it('skips the write when the provider avatar hash is unchanged', async () => {
    const entity = new AuthUserEntity({
      email: 'user@example.com',
      avatarStatus: 'provider',
      avatarUrl: 'https://cdn.example.com/telegram.png',
      avatarHash: 'telegram-hash',
    });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.syncProviderAvatar('user-id', {
      url: 'https://cdn.example.com/moved.png',
      hash: 'telegram-hash',
    });

    expect(result._unsafeUnwrap()?.avatarUrl).toBe('https://cdn.example.com/telegram.png');
    expect(flush).not.toHaveBeenCalled();
  });

  it('maps repository errors raised while writing an avatar', async () => {
    const entity = new AuthUserEntity({ email: 'user@example.com' });
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    flush.mockRejectedValue(new Error('avatar update failed'));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.setAvatar('user-id', {
      url: 'https://cdn.example.com/manual.png',
      hash: 'manual-hash',
      status: 'manual',
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'avatar update failed',
    });
  });

  it('returns null when an email or id is unknown', async () => {
    const { entityManager } = createEntityManagerMock();
    const authUsers = new AuthUserRepository(entityManager);

    expect((await authUsers.findByEmail('missing@example.com'))._unsafeUnwrap()).toBeNull();
    expect((await authUsers.findById('00000000-0000-4000-8000-000000000000'))._unsafeUnwrap()).toBeNull();
    expect((await authUsers.setLocale('00000000-0000-4000-8000-000000000000', 'ru'))._unsafeUnwrap()).toBeNull();
    expect((await authUsers.recordLogin('00000000-0000-4000-8000-000000000000'))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await authUsers.setAvatar('00000000-0000-4000-8000-000000000000', {
          url: 'https://cdn.example.com/manual.png',
          hash: 'manual-hash',
          status: 'manual',
        })
      )._unsafeUnwrap(),
    ).toBeNull();
    expect((await authUsers.deleteAvatar('00000000-0000-4000-8000-000000000000'))._unsafeUnwrap()).toBeNull();
    expect(
      (
        await authUsers.syncProviderAvatar('00000000-0000-4000-8000-000000000000', {
          url: null,
          hash: null,
        })
      )._unsafeUnwrap(),
    ).toBeNull();
  });

  it('maps repository errors when creating users', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue(new Error('duplicate email'));
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.createUser({ email: 'user@example.com' });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'duplicate email',
    });
  });

  it('maps non-error repository failures', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue('database unavailable');
    const authUsers = new AuthUserRepository(entityManager);

    const result = await authUsers.findByEmail('user@example.com');

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Auth user repository failed.',
    });
  });
});
