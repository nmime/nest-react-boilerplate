// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicAuthMetadataKey } from './access-control.decorators';
import { DefaultDemoSubject, isDemoPrincipal } from './demo-access';
import {
  SessionAuthGuard,
  clearSessionPrincipal,
  readSessionPrincipal,
  setSessionPrincipal,
} from './session-auth.guard';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './access-control.types';
import { DefaultAuthTenantId } from './tenant-context';

const principal: AuthenticatedPrincipal = {
  subject: 'user-1',
  tenantId: DefaultAuthTenantId,
  email: 'user@example.com',
  roles: ['user'],
  permissions: ['profile:read'],
};

const createContext = (request: AuthenticatedRequest, handler: () => undefined = () => undefined): ExecutionContext => {
  const context = {
    getArgByIndex: () => request,
    getArgs: () => [request],
    getClass: () => class TestController {},
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
};

describe('SessionAuthGuard', () => {
  it('accepts a persisted session principal', () => {
    const identityPrincipal = { ...principal, roles: [], permissions: [] };
    const request: AuthenticatedRequest = { session: { user: identityPrincipal } };

    expect(new SessionAuthGuard().canActivate(createContext(request))).toBe(true);
    expect(request.user).toEqual(identityPrincipal);
  });

  it('preserves access already resolved by a database guard for the same identity', () => {
    const request: AuthenticatedRequest = {
      session: { user: { ...principal, roles: [], permissions: [] } },
      user: principal,
    };

    expect(new SessionAuthGuard().canActivate(createContext(request))).toBe(true);
    expect(request.user).toBe(principal);
    expect(request.auth).toBe(principal);
  });

  it('rejects bearer credentials when no session is available', () => {
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer header.payload.signature' },
    };

    expect(() => new SessionAuthGuard().canActivate(createContext(request))).toThrow(UnauthorizedException);
  });

  it('rejects requests without a session', () => {
    expect(() => new SessionAuthGuard().canActivate(createContext({}))).toThrow(UnauthorizedException);
  });

  it('skips authentication for public routes', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PublicAuthMetadataKey, true, handler);

    expect(new SessionAuthGuard(new Reflector()).canActivate(createContext({}, handler))).toBe(true);
  });

  it('rejects an array authorization header without a session', () => {
    const request: AuthenticatedRequest = {
      headers: { authorization: ['Bearer header.payload.signature'] },
    };

    expect(() => new SessionAuthGuard().canActivate(createContext(request))).toThrow(UnauthorizedException);
  });
});

describe('readSessionPrincipal under demo mode', () => {
  const demoEnv = { AUTH_DEMO_MODE: 'true' };

  it('returns nothing for an unauthenticated request while demo mode is off', () => {
    expect(readSessionPrincipal({}, {})).toBeUndefined();
  });

  it('authenticates an unauthenticated request as the demo principal', () => {
    const resolved = readSessionPrincipal({}, demoEnv);

    expect(resolved?.subject).toBe(DefaultDemoSubject);
    expect(isDemoPrincipal(resolved)).toBe(true);
  });

  it('never displaces a real session principal', () => {
    const request: AuthenticatedRequest = { session: { user: principal } };

    const resolved = readSessionPrincipal(request, demoEnv);

    expect(resolved).toEqual(principal);
    expect(isDemoPrincipal(resolved)).toBe(false);
  });

  it('lets the guard admit a request that carries no credentials at all', () => {
    const request: AuthenticatedRequest = {};

    expect(new SessionAuthGuard(new Reflector(), demoEnv).canActivate(createContext(request))).toBe(true);
    expect(request.user?.subject).toBe(DefaultDemoSubject);
  });
});

describe('session principal lifecycle helpers', () => {
  it('sets request principal fields even without a server-side session', () => {
    const request: AuthenticatedRequest = {};

    setSessionPrincipal(request, principal);

    expect(request.session).toBeUndefined();
    expect(request.tenantId).toBe(principal.tenantId);
    expect(request.user).toEqual(principal);
    expect(request.auth).toEqual(principal);
  });

  it('persists identity metadata without authorization grants', () => {
    const request: AuthenticatedRequest = { session: {} };

    setSessionPrincipal(request, principal);

    expect(request.session?.user).toEqual({ ...principal, roles: [], permissions: [] });
    expect(request.user).toEqual(principal);
  });

  it('clears the persisted session and request principal fields', () => {
    const request: AuthenticatedRequest = {
      session: { user: principal },
      tenantId: principal.tenantId,
      user: principal,
      auth: principal,
    };

    clearSessionPrincipal(request);

    expect(request.session?.user).toBeUndefined();
    expect(request.tenantId).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
  });

  it('clears request principal fields when no session is present', () => {
    const request = {
      tenantId: principal.tenantId,
      user: principal,
      auth: principal,
    } satisfies AuthenticatedRequest;

    clearSessionPrincipal(request);

    expect(request.tenantId).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
  });
});
