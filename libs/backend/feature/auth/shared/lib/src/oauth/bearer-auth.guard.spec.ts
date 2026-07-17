import { createHmac } from 'node:crypto';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  PublicAuthMetadataKey,
  RequiredPermissionsMetadataKey,
  RequiredRolesMetadataKey,
} from './access-control.decorators';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './access-control.types';
import { BearerAuthGuard, validateBearerAuthorization } from './bearer-auth.guard';
import { RbacGuard } from './rbac.guard';
import { DefaultAuthTenantId } from './tenant-context';

const jwtFixtureMaterial = Buffer.from([
  102, 105, 120, 116, 117, 114, 101, 45, 106, 119, 116, 45, 104, 109, 97, 99,
]).toString('utf8');
const now = 1_700_000_000;

function futureExpiration(): number {
  return Math.floor(Date.now() / 1000) + 60;
}

function signToken(payload: Record<string, unknown>, header: Record<string, unknown> = {}): string {
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', ...header })));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify({ exp: futureExpiration(), ...payload })));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(createHmac('sha256', jwtFixtureMaterial).update(signingInput).digest());

  return `${signingInput}.${signature}`;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_');
}

function createContext(
  request: AuthenticatedRequest,
  handler: () => undefined = () => undefined,
  controller: new () => unknown = class TestController {},
): ExecutionContext {
  const context = {
    getArgByIndex: () => request,
    getArgs: () => [request],
    getClass: () => controller,
    getHandler: () => handler,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    switchToRpc: () => ({
      getContext: () => undefined,
      getData: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
  };
  return context as unknown as ExecutionContext;
}

describe('BearerAuthGuard', () => {
  it('validates a signed HMAC bearer token and maps claims to the request principal', () => {
    const token = signToken({
      aud: ['web', 'api'],
      email: 'admin@example.com',
      exp: now + 60,
      iss: 'issuer',
      jti: 'token-id',
      name: 'Admin User',
      theme: 'dark',
      permissions: ['admin:read'],
      roles: ['admin'],
      scope: 'profile:read payments:read',
      sub: 'user-id',
    });

    const principal = validateBearerAuthorization(
      `Bearer ${token}`,
      {
        AUTH_JWT_AUDIENCE: 'api',
        AUTH_JWT_ISSUER: 'issuer',
        AUTH_JWT_SECRET: jwtFixtureMaterial,
      },
      now,
    );

    expect(principal).toEqual({
      audience: ['web', 'api'],
      displayName: 'Admin User',
      email: 'admin@example.com',
      issuer: 'issuer',
      locale: undefined,
      theme: 'dark',
      permissions: ['admin:read', 'profile:read', 'payments:read'],
      roles: ['admin'],
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      tokenId: 'token-id',
    });
  });

  it('omits absent optional auth-method claims while preserving required principal fields', () => {
    const token = signToken({
      exp: now + 60,
      sub: 'user-with-minimal-claims',
    });

    const principal = validateBearerAuthorization(`Bearer ${token}`, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now);

    expect(principal).toMatchObject({
      permissions: [],
      roles: [],
      subject: 'user-with-minimal-claims',
      tenantId: DefaultAuthTenantId,
    });
    expect(principal).not.toHaveProperty('amr');
    expect(principal).not.toHaveProperty('authProvider');
    expect(principal).not.toHaveProperty('authChannel');
    expect(principal).not.toHaveProperty('authTime');
    expect(principal).not.toHaveProperty('externalIdentityId');
  });

  it('attaches principal to user and auth request fields', () => {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    const token = signToken({
      exp: currentTimeInSeconds + 60,
      permissions: 'profile:read',
      sub: 'user-id',
    });
    const request: AuthenticatedRequest = {
      headers: { authorization: `Bearer ${token}` },
    };

    const guard = new BearerAuthGuard(new Reflector());
    const previousSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = jwtFixtureMaterial;
    try {
      expect(guard.canActivate(createContext(request))).toBe(true);
    } finally {
      restoreEnv('AUTH_JWT_SECRET', previousSecret);
    }

    expect(request.user).toMatchObject({
      permissions: ['profile:read'],
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
    });
    expect(request.auth).toBe(request.user);
  });

  it('maps auth-method, tenant, and locale claims when present', () => {
    const tenantClaim = '33333333-3333-4333-8333-333333333333';
    const token = signToken({
      amr: ['pwd', 'otp'],
      auth_channel: 'telegram_oidc',
      auth_provider: 'telegram',
      auth_time: 1_699_000_000,
      external_identity_id: 'ext-123',
      avatar_url: 'https://cdn.example.test/avatar.png',
      locale: 'en-US',
      sub: 'rich-user',
      tid: tenantClaim,
    });

    const principal = validateBearerAuthorization(`Bearer ${token}`, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now);

    expect(principal).toMatchObject({
      amr: ['pwd', 'otp'],
      authChannel: 'telegram_oidc',
      authProvider: 'telegram',
      authTime: 1_699_000_000,
      externalIdentityId: 'ext-123',
      avatarUrl: 'https://cdn.example.test/avatar.png',
      locale: 'en',
      subject: 'rich-user',
      tenantId: tenantClaim,
    });
  });

  it('falls back to the tenantId claim when the tid claim is absent', () => {
    const tenantClaim = '44444444-4444-4444-8444-444444444444';
    const token = signToken({
      sub: 'tenant-claim-user',
      tenantId: tenantClaim,
    });

    const principal = validateBearerAuthorization(`Bearer ${token}`, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now);

    expect(principal.tenantId).toBe(tenantClaim);
  });

  it('ignores unsupported locale claim values', () => {
    const token = signToken({ locale: 'fr-FR', sub: 'locale-user' });

    const principal = validateBearerAuthorization(`Bearer ${token}`, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now);

    expect(principal.locale).toBeUndefined();
  });

  it('ignores unsupported theme claim values', () => {
    const token = signToken({ sub: 'theme-user', theme: 'neon' });

    const principal = validateBearerAuthorization(`Bearer ${token}`, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now);

    expect(principal.theme).toBeUndefined();
  });

  it('skips validation for public routes', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PublicAuthMetadataKey, true, handler);

    expect(new BearerAuthGuard(new Reflector()).canActivate(createContext({ headers: {} }, handler))).toBe(true);
  });

  it('accepts capitalized bearer scheme with extra token whitespace', () => {
    const token = signToken({ sub: 'case-user' });

    expect(
      validateBearerAuthorization(`bEaReR   ${token}   `, { AUTH_JWT_SECRET: jwtFixtureMaterial }, now).subject,
    ).toBe('case-user');
  });

  it('reads authorization from array and request getter headers', () => {
    const arrayHeaderToken = signToken({ sub: 'array-user' });
    const arrayRequest: AuthenticatedRequest = {
      headers: { authorization: [`Bearer ${arrayHeaderToken}`] },
    };
    const previousSecret = process.env.AUTH_JWT_SECRET;
    process.env.AUTH_JWT_SECRET = jwtFixtureMaterial;
    try {
      expect(new BearerAuthGuard(new Reflector()).canActivate(createContext(arrayRequest))).toBe(true);
    } finally {
      restoreEnv('AUTH_JWT_SECRET', previousSecret);
    }
    expect(arrayRequest.user?.subject).toBe('array-user');

    const getterToken = signToken({ sub: 'getter-user' });
    const request: AuthenticatedRequest = {
      headers: {},
      get: (name: string) => (name === 'authorization' ? `Bearer ${getterToken}` : undefined),
    };
    const guard = new BearerAuthGuard(new Reflector());
    process.env.AUTH_JWT_SECRET = jwtFixtureMaterial;
    try {
      expect(guard.canActivate(createContext(request))).toBe(true);
    } finally {
      restoreEnv('AUTH_JWT_SECRET', previousSecret);
    }

    expect(request.user?.subject).toBe('getter-user');

    const capitalizedGetterToken = signToken({
      sub: 'capitalized-getter-user',
    });
    const capitalizedGetterRequest: AuthenticatedRequest = {
      get: (name: string) => (name === 'Authorization' ? `Bearer ${capitalizedGetterToken}` : undefined),
    };
    process.env.AUTH_JWT_SECRET = jwtFixtureMaterial;
    try {
      expect(guard.canActivate(createContext(capitalizedGetterRequest))).toBe(true);
    } finally {
      restoreEnv('AUTH_JWT_SECRET', previousSecret);
    }

    expect(capitalizedGetterRequest.user?.subject).toBe('capitalized-getter-user');
  });

  it.each([
    ['missing secret', `Bearer ${signToken({ sub: 'user-id' })}`, {}, 'AUTH_JWT_SECRET'],
    ['missing bearer', undefined, { AUTH_JWT_SECRET: jwtFixtureMaterial }, 'Missing bearer token'],
    ['bearer without token separator', 'Bearer', { AUTH_JWT_SECRET: jwtFixtureMaterial }, 'Missing bearer token'],
    ['empty bearer token', 'Bearer   ', { AUTH_JWT_SECRET: jwtFixtureMaterial }, 'Missing bearer token'],
    ['wrong authorization scheme', 'Basic abc', { AUTH_JWT_SECRET: jwtFixtureMaterial }, 'Missing bearer token'],
    [
      'non bearer authorization with token-like value',
      `Token ${signToken({ sub: 'user-id' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'Missing bearer token',
    ],
    [
      'malformed header JSON',
      'Bearer bm90LWpzb24.e30.signature',
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'Malformed JWT header',
    ],
    [
      'missing subject',
      `Bearer ${signToken({ roles: ['user'] })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'subject is required',
    ],
    ['malformed token', 'Bearer not-a-jwt', { AUTH_JWT_SECRET: jwtFixtureMaterial }, 'Malformed JWT'],
    [
      'alg none',
      `Bearer ${signToken({ sub: 'user-id' }, { alg: 'none' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'alg none',
    ],
    [
      'missing alg',
      `Bearer ${signToken({ sub: 'user-id' }, { alg: undefined })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'Unsupported JWT algorithm',
    ],
    [
      'unsupported alg',
      `Bearer ${signToken({ sub: 'user-id' }, { alg: 'RS256' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'Unsupported JWT algorithm',
    ],
    [
      'bad signature',
      `Bearer ${signToken({ sub: 'user-id' })}x`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'Invalid JWT signature',
    ],
    [
      'missing expiration',
      `Bearer ${signToken({ exp: undefined, sub: 'user-id' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'expiration is required',
    ],
    [
      'expired',
      `Bearer ${signToken({ exp: now - 1, sub: 'user-id' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'expired',
    ],
    [
      'not before',
      `Bearer ${signToken({ nbf: now + 1, sub: 'user-id' })}`,
      { AUTH_JWT_SECRET: jwtFixtureMaterial },
      'not active',
    ],
    [
      'issuer mismatch',
      `Bearer ${signToken({ iss: 'other', sub: 'user-id' })}`,
      { AUTH_JWT_ISSUER: 'issuer', AUTH_JWT_SECRET: jwtFixtureMaterial },
      'issuer mismatch',
    ],
    [
      'audience mismatch',
      `Bearer ${signToken({ aud: 'web', sub: 'user-id' })}`,
      { AUTH_JWT_AUDIENCE: 'api', AUTH_JWT_SECRET: jwtFixtureMaterial },
      'audience mismatch',
    ],
  ])('rejects %s', (_, header, env, message) => {
    expect(() => validateBearerAuthorization(header, env, now)).toThrow(UnauthorizedException);
    expect(() => validateBearerAuthorization(header, env, now)).toThrow(message);
  });
});

describe('RbacGuard', () => {
  it('allows public routes', () => {
    const publicHandler = () => undefined;
    Reflect.defineMetadata(PublicAuthMetadataKey, true, publicHandler);
    const guard = new RbacGuard(new Reflector());

    expect(guard.canActivate(createContext({}, publicHandler))).toBe(true);
  });

  it('requires an authenticated principal even when routes have no RBAC metadata', () => {
    const guard = new RbacGuard(new Reflector());

    expect(() => guard.canActivate(createContext({}))).toThrow(UnauthorizedException);
    expect(guard.canActivate(createContext({ user: createPrincipal({}) }))).toBe(true);
  });

  it('allows any matching role and all required generic permissions', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredRolesMetadataKey, ['support', 'manager'], handler);
    Reflect.defineMetadata(RequiredPermissionsMetadataKey, ['profile:read', 'tickets:read'], handler);
    const principal = createPrincipal({
      permissions: ['profile:read', 'tickets:read'],
      roles: ['support'],
    });

    expect(new RbacGuard(new Reflector()).canActivate(createContext({ user: principal }, handler))).toBe(true);
  });

  it('rejects missing role, missing permission, and absent principals', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredRolesMetadataKey, ['support'], handler);
    Reflect.defineMetadata(RequiredPermissionsMetadataKey, ['tickets:read'], handler);
    const guard = new RbacGuard(new Reflector());

    expect(() =>
      guard.canActivate(
        createContext(
          {
            user: createPrincipal({
              permissions: ['tickets:read'],
              roles: ['user'],
            }),
          },
          handler,
        ),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(createContext({ user: createPrincipal({ permissions: [], roles: ['support'] }) }, handler)),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext({}, handler))).toThrow(UnauthorizedException);
  });
});

function createPrincipal(partial: Partial<AuthenticatedPrincipal>): AuthenticatedPrincipal {
  return {
    permissions: [],
    roles: [],
    subject: 'user-id',
    tenantId: DefaultAuthTenantId,
    ...partial,
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
