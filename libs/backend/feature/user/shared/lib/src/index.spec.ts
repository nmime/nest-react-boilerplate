import { describe, expect, it } from 'vitest';
import { Language } from '@app/backend-feature-auth-shared';
import {
  createUserProfile,
  GetCurrentUserProfileUseCase,
  toUserProfilePayload,
  toUserProfileView,
  UserProfileReadPermission,
} from './index';

describe('user shared', () => {
  it('keeps domain profile creation framework-free and normalized', () => {
    expect(
      createUserProfile({
        subject: 'user-id',
        email: 'user@example.com',
        displayName: 'User',
        locale: 'ru',
        roles: [' user ', 'user', ''],
        permissions: [UserProfileReadPermission, UserProfileReadPermission],
      }),
    ).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      displayName: 'User',
      locale: 'ru',
      roles: ['user'],
      permissions: [UserProfileReadPermission],
    });
  });

  it('uses the application use case to expose the current profile', () => {
    const principal = {
      subject: 'user-id',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      displayName: 'User',
      locale: Language.Ru,
      roles: ['user'],
      permissions: [UserProfileReadPermission],
    };

    expect(new GetCurrentUserProfileUseCase().execute(principal)).toEqual({
      principal,
      profile: {
        id: 'user-id',
        email: 'user@example.com',
        displayName: 'User',
        locale: 'ru',
        roles: ['user'],
        permissions: [UserProfileReadPermission],
      },
    });
  });

  it('maps principals to user profile views', () => {
    expect(
      toUserProfileView({
        subject: 'user-id',
        tenantId: 'tenant-1',
        email: 'user@example.com',
        displayName: 'User',
        locale: Language.Ru,
        roles: ['user', 'user'],
        permissions: [UserProfileReadPermission],
      }),
    ).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      displayName: 'User',
      locale: 'ru',
      roles: ['user'],
      permissions: [UserProfileReadPermission],
    });
  });

  it('presents current profile payloads for interfaces', () => {
    const principal = {
      subject: 'user-id',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      roles: ['user'],
      permissions: [UserProfileReadPermission],
    };

    expect(toUserProfilePayload(principal)).toEqual({
      principal,
      profile: {
        id: 'user-id',
        email: 'user@example.com',
        roles: ['user'],
        permissions: [UserProfileReadPermission],
      },
    });
  });
});
