// @requirements REQ-AUTH-SESSION-002
// Evidence for: REQ-AUTH-SESSION-002
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
// Domain evidence for REQ-AUTH-SESSION-002.
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { DefaultDemoSubject, PublicAuthMetadataKey, type AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import type { AuthRoleStore, AuthUserStore } from '../../infrastructure';
import { PersistentSessionAccessGuard } from './persistent-session-access.guard';

const tenantId = '00000000-0000-4000-8000-000000000001';
const principal = { subject: 'user-id', tenantId, roles: ['stale'], permissions: ['stale:permission'] };

function contextFor(request: AuthenticatedRequest) {
  return {
    getClass: () => class AuthController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function dependencies(input?: {
  user?: { status: string; credentialRevision?: number; emailVerifiedAt?: Date | null } | null;
  userError?: boolean;
  accessError?: boolean;
  public?: boolean;
}) {
  const metadata = {
    getAllAndOverride: vi.fn((key: string) => (key === PublicAuthMetadataKey ? (input?.public ?? false) : false)),
  } as unknown as Reflector;
  const users = {
    findById: vi.fn(async () =>
      input?.userError
        ? ({ isErr: () => true } as never)
        : ({
            isErr: () => false,
            value:
              input?.user === undefined
                ? { status: 'active', credentialRevision: 0, emailVerifiedAt: null }
                : input.user,
          } as never),
    ),
  } as unknown as AuthUserStore;
  const roles = {
    resolveEffectiveAccess: vi.fn(async () =>
      input?.accessError
        ? ({ isErr: () => true } as never)
        : ({ isErr: () => false, value: { roleKeys: ['member'], permissionKeys: ['profile:read'] } } as never),
    ),
  } as unknown as AuthRoleStore;
  return { guard: new PersistentSessionAccessGuard(metadata, users, roles), roles, users };
}

describe(PersistentSessionAccessGuard.name, () => {
  it('uses the cookie session for identity and replaces cached access with database access', async () => {
    const request: AuthenticatedRequest = { session: { user: principal } };
    const { guard, roles, users } = dependencies();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(users.findById).toHaveBeenCalledWith('user-id', tenantId);
    expect(roles.resolveEffectiveAccess).toHaveBeenCalledWith('user-id', tenantId);
    expect(request.user).toMatchObject({ roles: ['member'], permissions: ['profile:read'] });
    expect(request.auth).toBe(request.user);
  });

  it('rejects bearer-only, missing, and disabled identities', async () => {
    await expect(
      dependencies().guard.canActivate(contextFor({ headers: { authorization: 'Bearer ignored' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(dependencies().guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      dependencies({ user: { status: 'disabled' } }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session minted before the account credential changed', async () => {
    const { guard, roles } = dependencies({ user: { status: 'active', credentialRevision: 2 } });

    await expect(
      guard.canActivate(contextFor({ session: { user: { ...principal, credentialRevision: 1 } } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The session dies before any grant is resolved for it.
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('accepts a session stamped with the current credential revision', async () => {
    const { guard } = dependencies({ user: { status: 'active', credentialRevision: 2 } });
    const request: AuthenticatedRequest = { session: { user: { ...principal, credentialRevision: 2 } } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.credentialRevision).toBe(2);
  });

  it('treats a session issued before the epoch existed as revision zero', async () => {
    const { guard } = dependencies({ user: { status: 'active', credentialRevision: 0 } });

    await expect(guard.canActivate(contextFor({ session: { user: principal } }))).resolves.toBe(true);
  });

  it('refreshes the verified-email claim from the account rather than the session', async () => {
    const { guard } = dependencies({
      user: { status: 'active', credentialRevision: 0, emailVerifiedAt: new Date('2026-02-02T00:00:00.000Z') },
    });
    const request: AuthenticatedRequest = { session: { user: { ...principal, emailVerified: false } } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.emailVerified).toBe(true);
  });

  it('fails closed on identity or RBAC database errors', async () => {
    await expect(
      dependencies({ userError: true }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      dependencies({ accessError: true }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('allows a public request without creating an alternate authentication path', async () => {
    const { guard, roles, users } = dependencies({ public: true });
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('serves a demo-mode request without touching the database', async () => {
    vi.stubEnv('AUTH_DEMO_MODE', 'true');
    const request: AuthenticatedRequest = {};
    const { guard, roles, users } = dependencies();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(request.user?.subject).toBe(DefaultDemoSubject);
    expect(request.auth).toBe(request.user);
  });
});
