import { describe, expect, it } from 'vitest';
import { AuthProvider, AuthProviderChannel } from '@app/backend-feature-auth-shared';
import type { AuthRefreshTokenEntity } from '@app/backend-postgres-main-auth';
import { toRefreshTokenAuthContext, toRefreshTokenRecord } from './auth-token-store.util';

describe('toRefreshTokenAuthContext', () => {
  it('returns null when there is no persisted context', () => {
    expect(toRefreshTokenAuthContext(null)).toBeNull();
    expect(toRefreshTokenAuthContext(undefined)).toBeNull();
    // The NOT NULL column defaults to '{}' for legacy rows — an empty object is
    // "no context" and must map to null so step-up fails closed after refresh.
    expect(toRefreshTokenAuthContext({})).toBeNull();
  });

  it('maps a fully-populated persisted context, narrowing provider/channel to their enums', () => {
    expect(
      toRefreshTokenAuthContext({
        authTime: 1767225600,
        amr: ['pwd'],
        authProvider: AuthProvider.Password,
        authChannel: AuthProviderChannel.Password,
      }),
    ).toEqual({
      authTime: 1767225600,
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
      authChannel: AuthProviderChannel.Password,
    });
  });

  it('omits members that were not persisted (e.g. legacy authTime-only rows)', () => {
    expect(toRefreshTokenAuthContext({ authTime: 42 })).toEqual({ authTime: 42 });
  });
});

describe('toRefreshTokenRecord', () => {
  const baseEntity = {
    id: 'token-id',
    tenantId: 'tenant-id',
    userId: 'user-id',
    tokenHash: 'hash',
    familyId: 'family-id',
    parentTokenId: null,
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    revokedAt: null,
    replacedByTokenId: null,
  };

  it('carries the persisted auth context onto the record', () => {
    const record = toRefreshTokenRecord({
      ...baseEntity,
      authContext: { authTime: 1767225600, amr: ['pwd'], authProvider: AuthProvider.Password },
    } as AuthRefreshTokenEntity);

    expect(record.authContext).toEqual({
      authTime: 1767225600,
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
    });
  });

  it('maps an empty (legacy default) auth context to null', () => {
    const record = toRefreshTokenRecord({ ...baseEntity, authContext: {} } as AuthRefreshTokenEntity);
    expect(record.authContext).toBeNull();
  });
});
