// @requirements REQ-AUTH-ACCESS-001
// Evidence for: REQ-AUTH-CREDENTIAL-003
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { AuthenticatedTheme, DefaultAuthTenantId, createDefaultAccessPolicy } from '@app/backend-feature-auth-shared';
import type { AuthTokenStore, AuthUserRecord, AuthUserStore } from '../infrastructure';
import { InMemoryAuthUserStore } from '../infrastructure/auth-user-store';
import { InMemoryAuthRoleStore } from '../infrastructure/auth-role-store';
import { InMemoryAuthTokenStore } from '../infrastructure/auth-token-store';
import { hashPassword, normalizeEmail, verifyPassword } from '../domain';
import { AuthService } from './auth.service';
import { EffectivePermissionService } from './effective-permission.service';

const createUserRecord = (overrides: Partial<AuthUserRecord> = {}): AuthUserRecord => ({
  id: 'user-id',
  tenantId: DefaultAuthTenantId,
  email: 'user@example.com',
  displayName: null,
  passwordHash: hashPassword('password123', 'fixed-salt'),
  roles: ['user'],
  permissions: ['profile:read'],
  locale: null,
  theme: AuthenticatedTheme.System,
  status: 'active' as const,
  lastLoginAt: null,
  avatarUrl: null,
  avatarHash: null,
  avatarStatus: 'none',
  ...overrides,
});

describe('AuthService', () => {
  it('registers, logs in, and returns credential-free session views', async () => {
    const service = new AuthService(new InMemoryAuthUserStore());

    const registered = await service.register({
      email: 'User@Example.com',
      password: 'password123',
      displayName: 'User',
    });

    expect(registered.user).toMatchObject({
      email: 'user@example.com',
      displayName: 'User',
      theme: 'system',
      roles: ['user'],
      permissions: ['profile:read'],
    });
    expect(registered).toMatchObject({
      amr: ['pwd'],
      authProvider: 'password',
      authChannel: 'password',
    });
    expect(registered).not.toHaveProperty('accessToken');
    expect(registered).not.toHaveProperty('refreshToken');
    expect(registered).not.toHaveProperty('tokenType');

    const loggedIn = await service.login({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(loggedIn.user.id).toBe(registered.user.id);
    await expect(service.getUserById(registered.user.id)).resolves.toMatchObject({
      email: 'user@example.com',
    });
    await expect(service.getUserById('missing')).resolves.toBeNull();
  });

  it('bootstraps normalized roles and returns the shared-matrix projection', async () => {
    const previousEnabled = process.env.ADMIN_BOOTSTRAP_ENABLED;
    const previousEmails = process.env.ADMIN_BOOTSTRAP_EMAILS;
    process.env.ADMIN_BOOTSTRAP_ENABLED = 'true';
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'admin@example.com';

    const users = new InMemoryAuthUserStore();
    const roles = new InMemoryAuthRoleStore();
    const resolver = new EffectivePermissionService(roles, users);
    const service = new AuthService(users, undefined, undefined, resolver);

    const normal = await service.register({
      email: 'member@example.com',
      password: 'password123',
    });
    const adminSession = await service.register({
      email: 'admin@example.com',
      password: 'password123',
    });

    // The resolver assigned roles to the normalized store and refreshed the
    // denormalized cache; the resulting claims must equal what the pre-Phase-2
    // createDefaultAccessPolicy produced from the shared matrix.
    const normalPolicy = createDefaultAccessPolicy('member@example.com', process.env);
    const adminPolicy = createDefaultAccessPolicy('admin@example.com', process.env);
    expect(normalPolicy.roles).toEqual(['user']);
    expect(adminPolicy.roles).toEqual(['user', 'admin']);

    expect(normal.user.roles).toEqual(normalPolicy.roles);
    expect(normal.user.permissions).toEqual(normalPolicy.permissions);
    expect(adminSession.user.roles).toEqual(adminPolicy.roles);
    expect(adminSession.user.permissions).toEqual(adminPolicy.permissions);

    // The normalized assignment tables hold the same role keys.
    const assignedRoleKeys = (await roles.listRoleKeys(adminSession.user.id))._unsafeUnwrap();
    expect([...assignedRoleKeys].sort((left, right) => left.localeCompare(right))).toEqual(['admin', 'user']);

    // The persisted cache (what createAuthSession reads on the hot path) matches.
    const persistedAdmin = (await users.findById(adminSession.user.id))._unsafeUnwrap();
    expect(persistedAdmin?.roles).toEqual(adminPolicy.roles);
    expect(persistedAdmin?.permissions).toEqual(adminPolicy.permissions);

    expect(adminSession).not.toHaveProperty('accessToken');

    if (previousEnabled === undefined) {
      delete process.env.ADMIN_BOOTSTRAP_ENABLED;
    } else {
      process.env.ADMIN_BOOTSTRAP_ENABLED = previousEnabled;
    }
    if (previousEmails === undefined) {
      delete process.env.ADMIN_BOOTSTRAP_EMAILS;
    } else {
      process.env.ADMIN_BOOTSTRAP_EMAILS = previousEmails;
    }
  });

  it('persists normalized locale/theme in session views and updates', async () => {
    const service = new AuthService(new InMemoryAuthUserStore());

    const registered = await service.register({
      email: 'locale@example.com',
      password: 'password123',
      locale: 'ru-RU',
      theme: 'Dark',
    });

    expect(registered.user.locale).toBe('ru');
    expect(registered.user.theme).toBe('dark');

    await expect(service.updateUserLocale(registered.user.id, 'en-US')).resolves.toMatchObject({ locale: 'en' });
    await expect(
      service.updateUserPreferences(registered.user.id, {
        locale: 'ru',
        theme: 'light',
      }),
    ).resolves.toMatchObject({ locale: 'ru', theme: 'light' });
    await expect(service.updateUserPreferences(registered.user.id, { locale: 'en-US' })).resolves.toMatchObject({
      locale: 'en',
      theme: 'light',
    });
    await expect(
      service.updateUserPreferences(registered.user.id, { locale: 'ru', theme: undefined }),
    ).resolves.toMatchObject({ locale: 'ru', theme: 'light' });
    await expect(
      service.updateUserPreferences(registered.user.id, { locale: undefined, theme: 'dark' }),
    ).resolves.toMatchObject({ locale: 'ru', theme: 'dark' });
    await expect(service.updateUserPreferences(registered.user.id, { theme: 'dark' })).resolves.toMatchObject({
      locale: 'ru',
      theme: 'dark',
    });
    await expect(service.updateUserPreferences(registered.user.id, {})).resolves.toMatchObject({
      locale: 'ru',
      theme: 'dark',
    });
    await expect(service.getUserById(registered.user.id)).resolves.toMatchObject({
      locale: 'ru',
      theme: 'dark',
    });
    await expect(service.updateUserLocale(registered.user.id, 'fr-FR')).rejects.toThrow(BadRequestException);
    await expect(service.updateUserPreferences(registered.user.id, { theme: 'sepia' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects malformed preference payloads before validation', async () => {
    const service = new AuthService(new InMemoryAuthUserStore());
    const registered = await service.register({
      email: 'bad-payload@example.com',
      password: 'password123',
    });

    for (const input of [null, undefined, 'en', 1, true, ['en']]) {
      // eslint-disable-next-line no-await-in-loop -- payload rejections are asserted sequentially to keep each failing input isolated
      await expect(service.updateUserPreferences(registered.user.id, input as never)).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('rejects duplicate registrations and invalid credentials', async () => {
    const service = new AuthService(new InMemoryAuthUserStore());
    await service.register({ email: 'a@example.com', password: 'password123' });

    await expect(service.register({ email: 'a@example.com', password: 'password123' })).rejects.toThrow(
      'Email is already registered',
    );
    await expect(service.login({ email: 'a@example.com', password: 'wrongpass' })).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('maps store failures, inactive users, and fallback login records', async () => {
    const failingStore = {
      findByEmail: () => errAsync({ code: 'repository_error' as const, message: 'find failed' }),
      create: () =>
        errAsync({
          code: 'repository_error' as const,
          message: 'create failed',
        }),
      findById: () => errAsync({ code: 'repository_error' as const, message: 'id failed' }),
      setLocale: () => okAsync(null),
      setPreferences: () => okAsync(null),
      recordLogin: () => okAsync(null),
      syncProviderAvatar: () => okAsync(null),
    };
    const serviceWithFindFailure = new AuthService(failingStore);
    await expect(
      serviceWithFindFailure.register({
        email: 'err@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWithFindFailure.login({
        email: 'err@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(serviceWithFindFailure.getUserById('id')).resolves.toBeNull();

    const creatingFailureStore = {
      ...failingStore,
      findByEmail: () => okAsync(null),
    };
    await expect(
      new AuthService(creatingFailureStore as never).register({
        email: 'err@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow('create failed');

    const inactiveHash = hashPassword('password123', 'inactive-salt');
    const inactiveStore = {
      findByEmail: () =>
        okAsync({
          id: 'disabled-id',
          tenantId: DefaultAuthTenantId,
          email: 'disabled@example.com',
          displayName: null,
          passwordHash: inactiveHash,
          roles: ['user'],
          permissions: ['profile:read'],
          locale: null,
          theme: AuthenticatedTheme.System,
          status: 'disabled' as const,
          lastLoginAt: null,
        }),
      create: () => okAsync(null),
      findById: () => okAsync(null),
      recordLogin: () => okAsync(null),
    };
    await expect(
      new AuthService(inactiveStore as never).login({
        email: 'disabled@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow('User is not active');

    const activeHash = hashPassword('password123', 'active-salt');
    const activeRecord = createUserRecord({
      id: 'active-id',
      email: 'active@example.com',
      passwordHash: activeHash,
    });
    const fallbackLogin = await new AuthService({
      findByEmail: () => okAsync(activeRecord),
      create: () => okAsync(activeRecord),
      findById: () => okAsync(activeRecord),
      setLocale: () => okAsync(null),
      setPreferences: () => okAsync(null),
      recordLogin: () => okAsync(null),
      syncProviderAvatar: () => okAsync(null),
    }).login({ email: 'active@example.com', password: 'password123' });
    expect(fallbackLogin.user.id).toBe('active-id');
  });

  it('creates credential-free server session views', () => {
    const service = new AuthService(new InMemoryAuthUserStore());
    const baseUser = createUserRecord({ id: 'id', passwordHash: 'hash', permissions: [], roles: [] });
    const session = service.createSession(baseUser);
    expect(session.user.id).toBe('id');
    expect(session).not.toHaveProperty('accessToken');
    expect(session).not.toHaveProperty('refreshToken');
    expect(session).not.toHaveProperty('expiresIn');
  });

  it('handles user-action token fallback branches', async () => {
    const activeRecord = createUserRecord({ id: 'active-id' });
    const tokenStore = new InMemoryAuthTokenStore();
    const users = {
      findByEmail: vi.fn().mockReturnValueOnce(okAsync(null)).mockReturnValue(okAsync(activeRecord)),
    };
    const actionService = new AuthService(users as never, tokenStore);
    await expect(
      actionService.issueEmailVerificationToken({
        email: 'missing@example.com',
      }),
    ).resolves.toBeNull();
    const verificationToken = await actionService.issueEmailVerificationToken({
      email: 'active@example.com',
    });
    const resetToken = await actionService.issuePasswordResetToken({
      email: 'active@example.com',
    });
    expect(verificationToken).toEqual(expect.any(String));
    expect(resetToken).toEqual(expect.any(String));

    const publishUserAction = vi.fn().mockResolvedValue(undefined);
    const notifyingActionService = new AuthService(users as never, new InMemoryAuthTokenStore(), undefined, undefined, {
      publishUserAction,
    } as never);
    const deliveredResetToken = await notifyingActionService.issuePasswordResetToken({
      email: 'active@example.com',
    });
    expect(publishUserAction).toHaveBeenCalledWith({
      userId: activeRecord.id,
      purpose: 'password_reset',
      token: deliveredResetToken,
    });

    const issueFailureTokens: Partial<AuthTokenStore> = {
      issueUserActionToken: () => errAsync({ code: 'token_store_error', message: 'issue failed' }),
    };
    await expect(
      new AuthService(users as never, issueFailureTokens as AuthTokenStore).issuePasswordResetToken({
        email: 'active@example.com',
      }),
    ).resolves.toBeNull();
    await expect(actionService.consumeUserActionToken(verificationToken ?? '', 'email_verification')).resolves.toBe(
      true,
    );
    await expect(actionService.consumeUserActionToken(verificationToken ?? '', 'email_verification')).resolves.toBe(
      false,
    );
  });

  it('redeems an emailed verification code and reports the verified account', async () => {
    const users = new InMemoryAuthUserStore();
    const service = new AuthService(users, new InMemoryAuthTokenStore());
    const registered = await service.register({ email: 'verify@example.com', password: 'password123' });

    const token = await service.issueEmailVerificationToken({ email: 'verify@example.com' });
    await expect(service.confirmEmailVerification({ token: token ?? '' })).resolves.toMatchObject({
      id: registered.user.id,
    });

    expect((await users.findById(registered.user.id))._unsafeUnwrap()?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('redeems an emailed reset code, replaces the password, and advances the credential revision', async () => {
    const users = new InMemoryAuthUserStore();
    const service = new AuthService(users, new InMemoryAuthTokenStore());
    await service.register({ email: 'reset@example.com', password: 'password123' });

    const token = await service.issuePasswordResetToken({ email: 'reset@example.com' });
    await expect(
      service.confirmPasswordReset({ token: token ?? '', password: 'replacement123' }),
    ).resolves.toMatchObject({ email: 'reset@example.com' });

    await expect(service.login({ email: 'reset@example.com', password: 'password123' })).rejects.toThrow(
      UnauthorizedException,
    );
    const session = await service.login({ email: 'reset@example.com', password: 'replacement123' });
    expect(session.credentialRevision).toBe(1);
  });

  it('refuses unknown, replayed, and cross-purpose recovery codes', async () => {
    const users = new InMemoryAuthUserStore();
    const service = new AuthService(users, new InMemoryAuthTokenStore());
    await service.register({ email: 'replay@example.com', password: 'password123' });

    await expect(service.confirmEmailVerification({ token: 'never-issued' })).rejects.toThrow(UnauthorizedException);

    const resetToken = (await service.issuePasswordResetToken({ email: 'replay@example.com' })) ?? '';
    // A reset code must not double as a verification code: the purpose is part of the lookup.
    await expect(service.confirmEmailVerification({ token: resetToken })).rejects.toThrow(UnauthorizedException);

    await service.confirmPasswordReset({ token: resetToken, password: 'replacement123' });
    await expect(service.confirmPasswordReset({ token: resetToken, password: 'again12345' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('fails a recovery confirmation whose account disappeared between issue and redemption', async () => {
    const users = new InMemoryAuthUserStore();
    const tokens = new InMemoryAuthTokenStore();
    const service = new AuthService(users, tokens);
    const registered = await service.register({ email: 'vanished@example.com', password: 'password123' });
    const token = (await service.issueEmailVerificationToken({ email: 'vanished@example.com' })) ?? '';

    (users as unknown as { usersById: Map<string, AuthUserRecord> }).usersById.delete(registered.user.id);

    await expect(service.confirmEmailVerification({ token })).rejects.toThrow(NotFoundException);
  });

  it('maps explicit-tenant preference updates, conflicts, and missing users', async () => {
    const updatedRecord = createUserRecord({
      id: 'preferences-id',
      locale: 'ru',
      theme: AuthenticatedTheme.Dark,
    });
    const setPreferences = vi
      .fn()
      .mockReturnValueOnce(okAsync(updatedRecord))
      .mockReturnValueOnce(errAsync({ code: 'repository_error', message: 'write failed' }))
      .mockReturnValueOnce(okAsync(null));
    const preferenceUsers: Partial<AuthUserStore> = {
      setPreferences,
    };
    const service = new AuthService(preferenceUsers as AuthUserStore);

    await expect(service.updateUserLocale('preferences-id', DefaultAuthTenantId, 'ru-RU')).resolves.toMatchObject({
      locale: 'ru',
    });
    expect(setPreferences).toHaveBeenCalledWith('preferences-id', { locale: 'ru' }, DefaultAuthTenantId);

    await expect(
      service.updateUserPreferences('preferences-id', DefaultAuthTenantId, {
        theme: 'dark',
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updateUserPreferences('preferences-id', DefaultAuthTenantId, {
        locale: 'en',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('records password methods and maps unexpected session errors', async () => {
    const social = {
      upsertMethod: vi.fn(() => okAsync({})),
    };
    const service = new AuthService(new InMemoryAuthUserStore(), undefined, social as never);

    const registered = await service.register({
      email: 'social@example.com',
      password: 'password123',
    });

    expect(registered).not.toHaveProperty('refreshToken');
    expect(social.upsertMethod).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'password',
        userId: registered.user.id,
      }),
    );

    const resolver = {
      assignRolesAndRefresh: vi.fn(() => Promise.resolve(null)),
    };
    const bootstrapUsers: Partial<AuthUserStore> = {};
    await expect(
      new AuthService(bootstrapUsers as AuthUserStore, undefined, undefined, resolver as never).bootstrapUserAccess(
        createUserRecord({ id: 'bootstrap-id' }),
        ['user'],
      ),
    ).resolves.toMatchObject({ id: 'bootstrap-id' });
    expect(resolver.assignRolesAndRefresh).toHaveBeenCalledWith({
      roleKeys: ['user'],
      tenantId: DefaultAuthTenantId,
      userId: 'bootstrap-id',
    });

    expect(() =>
      service.createSession({
        ...createUserRecord(),
        get id(): string {
          throw new Error('unexpected user shape');
        },
      }),
    ).toThrow('unexpected user shape');
  });

  it('normalizes email and hashes passwords', () => {
    const encoded = hashPassword('password123', 'fixed-salt');
    expect(normalizeEmail(' USER@EXAMPLE.COM ')).toBe('user@example.com');
    expect(verifyPassword('password123', encoded)).toBe(true);
    expect(verifyPassword('wrongpass', encoded)).toBe(false);
    expect(verifyPassword('password123', 'bad-format')).toBe(false);
  });
});
