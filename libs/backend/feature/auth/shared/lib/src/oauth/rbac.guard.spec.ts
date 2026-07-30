// @requirements REQ-AUTH-CREDENTIAL-003
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  PublicAuthMetadataKey,
  RequiredPermissionsMetadataKey,
  RequiredRolesMetadataKey,
} from './access-control.decorators';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './access-control.types';
import { RbacGuard, type PermissionEvaluationResult } from './rbac.guard';
import { DefaultAuthTenantId } from './tenant-context';

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

function createPrincipal(partial: Partial<AuthenticatedPrincipal>): AuthenticatedPrincipal {
  return {
    permissions: [],
    roles: [],
    subject: 'user-id',
    tenantId: DefaultAuthTenantId,
    ...partial,
  };
}

class DomainPermissionGuard extends RbacGuard {
  constructor(private readonly grant: PermissionEvaluationResult) {
    super(new Reflector());
  }

  protected override evaluateDomainPermission(): PermissionEvaluationResult {
    return this.grant;
  }
}

class MetadataRequiredGuard extends RbacGuard {
  protected override requiresPermissionMetadata(): boolean {
    return true;
  }
}

describe('RbacGuard domain extension points', () => {
  it('admits public routes without requiring a principal', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PublicAuthMetadataKey, true, handler);

    expect(new RbacGuard().canActivate(createContext({}, handler))).toBe(true);
  });

  it('rejects protected routes without an authenticated principal', () => {
    expect(() => new RbacGuard().canActivate(createContext({}))).toThrow(UnauthorizedException);
  });

  it('constructs with a default reflector and admits an authenticated principal', () => {
    const guard = new RbacGuard();

    expect(guard.canActivate(createContext({ user: createPrincipal({}) }))).toBe(true);
  });

  it('rejects when domain permission metadata is required but absent', () => {
    const guard = new MetadataRequiredGuard(new Reflector());

    expect(() => guard.canActivate(createContext({ user: createPrincipal({}) }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext({ user: createPrincipal({}) }))).toThrow(
      'Access permission metadata is missing.',
    );
  });

  it('honors a domain permission grant over an empty generic permission set', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredPermissionsMetadataKey, ['domain:special'], handler);

    expect(
      new DomainPermissionGuard(true).canActivate(
        createContext({ user: createPrincipal({ permissions: [] }) }, handler),
      ),
    ).toBe(true);
  });

  it('honors a domain permission denial even when the generic permission is present', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredPermissionsMetadataKey, ['domain:special'], handler);

    expect(() =>
      new DomainPermissionGuard(false).canActivate(
        createContext({ user: createPrincipal({ permissions: ['domain:special'] }) }, handler),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires at least one matching role when role metadata is present', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredRolesMetadataKey, ['admin', 'operator'], handler);

    expect(() => {
      new RbacGuard().canActivate(createContext({ user: createPrincipal({ roles: ['user'] }) }, handler));
    }).toThrow('Required role is missing.');
    expect(
      new RbacGuard().canActivate(createContext({ user: createPrincipal({ roles: ['operator'] }) }, handler)),
    ).toBe(true);
  });

  it('falls back to the principal permission set when no domain decision is provided', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RequiredPermissionsMetadataKey, ['profile:read'], handler);

    expect(
      new RbacGuard().canActivate(createContext({ user: createPrincipal({ permissions: ['profile:read'] }) }, handler)),
    ).toBe(true);
    expect(() => {
      new RbacGuard().canActivate(createContext({ user: createPrincipal({ permissions: [] }) }, handler));
    }).toThrow('Required permission is missing.');
  });
});
