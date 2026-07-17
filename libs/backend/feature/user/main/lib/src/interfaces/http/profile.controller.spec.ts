import { describe, expect, it } from 'vitest';
import { Language, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { GetCurrentUserProfileUseCase } from '@app/backend-feature-user-shared';
import { ProfileController } from './profile.controller';

describe('User ProfileController', () => {
  it('returns principal and profile', () => {
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      displayName: 'User Name',
      locale: Language.Ru,
      roles: ['user'],
      permissions: ['profile:read'],
    };

    expect(new ProfileController(new GetCurrentUserProfileUseCase()).me(principal)).toEqual({
      data: {
        principal,
        profile: {
          id: 'user-id',
          email: 'user@example.com',
          displayName: 'User Name',
          locale: 'ru',
          roles: ['user'],
          permissions: ['profile:read'],
        },
      },
    });
  });
});
