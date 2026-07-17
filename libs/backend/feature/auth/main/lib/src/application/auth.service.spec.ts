import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import {
  AuthenticatedTheme,
  DefaultAuthTenantId,
  createDefaultAccessPolicy,
  validateBearerAuthorization,
} from '@app/backend-feature-auth-shared';
import type { AuthTokenStore, AuthUserRecord, AuthUserStore } from '../infrastructure';
import { InMemoryAuthUserStore } from '../infrastructure/auth-user-store';
import { InMemoryAuthRoleStore } from '../infrastructure/auth-role-store';
import { InMemoryAuthTokenStore } from '../infrastructure/auth-token-store';
import { hashPassword, normalizeEmail, verifyPassword } from '../domain';
import { AuthService, signJwt } from './auth.service';
import { EffectivePermissionService } from './effective-permission.service';

const testJwtSecretValue = 'TEST_JWT_SECRET_VALUE_at_least_32_chars';
const authorizationScheme = 'Bearer';

const bearerAuthorization = (token: string): string => [authorizationScheme, token].join(' ');

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
  it('registers, logs in, records sessions, and signs verifiable JWTs', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
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
    expect(registered.tokenType).toBe('Bearer');
    expect(
      validateBearerAuthorization(bearerAuthorization(registered.accessToken), {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }),
    ).toMatchObject({
      subject: registered.user.id,
      amr: ['pwd'],
      authProvider: 'password',
      authChannel: 'password',
    });

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

  it('bootstraps by ROLE and refreshes the jsonb cache identically to the shared matrix', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
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

    // JWT claims stay identical in shape and content.
    expect(
      validateBearerAuthorization(bearerAuthorization(adminSession.accessToken), {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }),
    ).toMatchObject({
      roles: adminPolicy.roles,
      permissions: adminPolicy.permissions,
    });

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

  it('persists normalized locale/theme in sessions, JWT principals, and updates', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const service = new AuthService(new InMemoryAuthUserStore());

    const registered = await service.register({
      email: 'locale@example.com',
      password: 'password123',
      locale: 'ru-RU',
      theme: 'Dark',
    });

    expect(registered.user.locale).toBe('ru');
    expect(registered.user.theme).toBe('dark');
    expect(
      validateBearerAuthorization(bearerAuthorization(registered.accessToken), {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }).locale,
    ).toBe('ru');
    expect(
      validateBearerAuthorization(bearerAuthorization(registered.accessToken), {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }).theme,
    ).toBe('dark');

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
    await expect(service.updateUserPreferences(registered.user.id, { theme: 'dark' })).resolves.toMatchObject({
      locale: 'en',
      theme: 'dark',
    });
    await expect(service.updateUserPreferences(registered.user.id, {})).resolves.toMatchObject({
      locale: 'en',
      theme: 'dark',
    });
    await expect(service.getUserById(registered.user.id)).resolves.toMatchObject({
      locale: 'en',
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
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
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
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const failingStore = {
      findByEmail: () => errAsync({ code: 'repository_error' as const, message: 'find failed' }),
      create: () =>
        errAsync({
          code: 'repository_error' as const,
          message: 'create failed',
        }),
      findById: () => errAsync({ code: 'repository_error' as const, message: 'id failed' }),
      setAccessPolicy: () => okAsync(null),
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
      setAccessPolicy: () => okAsync(null),
      setLocale: () => okAsync(null),
      setPreferences: () => okAsync(null),
      recordLogin: () => okAsync(null),
      syncProviderAvatar: () => okAsync(null),
    }).login({ email: 'active@example.com', password: 'password123' });
    expect(fallbackLogin.user.id).toBe('active-id');
  });

  it('signs optional issuer/audience and falls back invalid expiry', () => {
    const token = signJwt(
      { sub: 'user' },
      {
        AUTH_JWT_SECRET: testJwtSecretValue,
        AUTH_JWT_ISSUER: 'issuer',
        AUTH_JWT_AUDIENCE: 'audience',
      },
      60,
    );
    expect(token.split('.')).toHaveLength(3);

    const service = new AuthService(new InMemoryAuthUserStore());
    const baseUser = createUserRecord({ id: 'id', passwordHash: 'hash', permissions: [], roles: [] });
    expect(
      service.createSession(baseUser, {
        AUTH_JWT_SECRET: testJwtSecretValue,
        AUTH_JWT_EXPIRES_IN_SECONDS: '60',
      }).expiresIn,
    ).toBe(60);

    const session = service.createSession(
      createUserRecord({ id: 'id', passwordHash: 'hash', permissions: [], roles: [] }),
      {
        AUTH_JWT_SECRET: testJwtSecretValue,
        AUTH_JWT_EXPIRES_IN_SECONDS: 'bad',
      },
    );
    expect(session.expiresIn).toBe(3600);
    expect(
      service.createSession(createUserRecord({ id: 'id', passwordHash: 'hash', permissions: [], roles: [] }), {
        AUTH_JWT_SECRET: testJwtSecretValue,
        AUTH_JWT_EXPIRES_IN_SECONDS: '0',
      }).expiresIn,
    ).toBe(3600);
  });

  it('rotates the refresh token when the user is still active', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const activeRecord = {
      id: 'active-id',
      tenantId: DefaultAuthTenantId,
      email: 'active@example.com',
      displayName: null,
      passwordHash: 'hash',
      roles: ['user'],
      permissions: ['profile:read'],
      locale: null,
      theme: AuthenticatedTheme.System,
      status: 'active' as const,
      lastLoginAt: null,
    };
    const rotate = vi.fn(() =>
      okAsync({
        id: 'new-id',
        tenantId: DefaultAuthTenantId,
        userId: 'active-id',
        token: 'next-refresh-token',
        tokenHash: 'next-hash',
        familyId: 'family',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const users = { findById: () => okAsync(activeRecord) };
    const tokens = {
      findRefreshToken: () =>
        okAsync({
          id: 'old-id',
          tenantId: DefaultAuthTenantId,
          userId: 'active-id',
          tokenHash: 'old-hash',
          familyId: 'family',
          parentTokenId: null,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          replacedByTokenId: null,
        }),
      rotateRefreshToken: rotate,
    };
    const service = new AuthService(users as never, tokens as never);

    const session = await service.refreshSession({ refreshToken: 'token' });
    expect(session.user.id).toBe('active-id');
    expect(session.refreshToken).toBe('next-refresh-token');
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it('does not rotate the refresh token when the user is inactive', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const disabledRecord = {
      id: 'disabled-id',
      tenantId: DefaultAuthTenantId,
      email: 'disabled@example.com',
      displayName: null,
      passwordHash: 'hash',
      roles: ['user'],
      permissions: ['profile:read'],
      locale: null,
      theme: AuthenticatedTheme.System,
      status: 'disabled' as const,
      lastLoginAt: null,
    };
    const rotate = vi.fn(() => okAsync(null));
    const users = { findById: () => okAsync(disabledRecord) };
    const tokens = {
      findRefreshToken: () =>
        okAsync({
          id: 'old-id',
          tenantId: DefaultAuthTenantId,
          userId: 'disabled-id',
          tokenHash: 'old-hash',
          familyId: 'family',
          parentTokenId: null,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          replacedByTokenId: null,
        }),
      rotateRefreshToken: rotate,
    };
    const service = new AuthService(users as never, tokens as never);

    await expect(service.refreshSession({ refreshToken: 'token' })).rejects.toThrow('Invalid refresh token');
    expect(rotate).not.toHaveBeenCalled();
  });

  it('handles refresh-token, revocation, and user-action token fallback branches', async () => {
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    const activeRecord = createUserRecord({ id: 'active-id' });
    const rotateMissing = vi.fn(() => okAsync(null));
    const missingUsers: Partial<AuthUserStore> = {};
    const missingTokens: Partial<AuthTokenStore> = {
      findRefreshToken: () => okAsync(null),
      rotateRefreshToken: rotateMissing,
    };
    const missingRefreshService = new AuthService(missingUsers as AuthUserStore, missingTokens as AuthTokenStore);

    await expect(missingRefreshService.refreshSession({ refreshToken: 'missing-token' })).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(rotateMissing).toHaveBeenCalledWith('missing-token', DefaultAuthTenantId);

    const activeUsers: Partial<AuthUserStore> = {
      findById: () => okAsync(activeRecord),
    };
    const unrotatableTokens: Partial<AuthTokenStore> = {
      findRefreshToken: () =>
        okAsync({
          id: 'old-id',
          tenantId: DefaultAuthTenantId,
          userId: activeRecord.id,
          tokenHash: 'old-hash',
          familyId: 'family',
          parentTokenId: null,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          replacedByTokenId: null,
        }),
      rotateRefreshToken: () => okAsync(null),
    };
    const unrotatableService = new AuthService(activeUsers as AuthUserStore, unrotatableTokens as AuthTokenStore);
    await expect(unrotatableService.refreshSession({ refreshToken: 'stale-token' })).rejects.toThrow(
      'Invalid refresh token',
    );

    const revokeFailureTokens: Partial<AuthTokenStore> = {
      revokeRefreshToken: () => errAsync({ code: 'token_store_error', message: 'offline' }),
    };
    const revokeFailureService = new AuthService(missingUsers as AuthUserStore, revokeFailureTokens as AuthTokenStore);
    await expect(revokeFailureService.revokeRefreshToken({ refreshToken: 'token' })).resolves.toBe(false);
    const revokeSuccessTokens: Partial<AuthTokenStore> = {
      revokeRefreshToken: () => okAsync(true),
    };
    await expect(
      new AuthService(missingUsers as AuthUserStore, revokeSuccessTokens as AuthTokenStore).revokeRefreshToken({
        refreshToken: 'token',
      }),
    ).resolves.toBe(true);

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

  it('records password methods, handles missing refresh issuance, and maps session signing errors', async () => {
    const social = {
      upsertMethod: vi.fn(() => okAsync({})),
    };
    const tokens = {
      issueRefreshToken: vi.fn(() => errAsync({ code: 'token_store_error', message: 'issue failed' })),
    };
    const service = new AuthService(new InMemoryAuthUserStore(), tokens as never, social as never);

    const registered = await service.register({
      email: 'social@example.com',
      password: 'password123',
    });

    expect(registered.refreshToken).toBeUndefined();
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
      service.createUserSession(createUserRecord(), {
        AUTH_JWT_SECRET: 'short',
        NODE_ENV: 'production',
      }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      service.createSession({
        ...createUserRecord(),
        get id(): string {
          throw new Error('unexpected user shape');
        },
      }),
    ).toThrow('unexpected user shape');
  });

  it('normalizes email, hashes passwords, and requires JWT secret', () => {
    const encoded = hashPassword('password123', 'fixed-salt');
    expect(normalizeEmail(' USER@EXAMPLE.COM ')).toBe('user@example.com');
    expect(verifyPassword('password123', encoded)).toBe(true);
    expect(verifyPassword('wrongpass', encoded)).toBe(false);
    expect(verifyPassword('password123', 'bad-format')).toBe(false);
    expect(() => signJwt({ sub: 'user' }, {}, 60)).toThrow(UnauthorizedException);
    expect(() => signJwt({ sub: 'user' }, { AUTH_JWT_SECRET: 'short', NODE_ENV: 'production' }, 60)).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      signJwt(
        {
          get sub() {
            throw new Error('unexpected jwt payload');
          },
        },
        { AUTH_JWT_SECRET: testJwtSecretValue },
        60,
      ),
    ).toThrow('unexpected jwt payload');
  });
});
