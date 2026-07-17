import { DECORATORS } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { AuthenticatedPrincipalDto, ProfilePayloadDto, UserProfileViewDto } from './profile.dto';

interface ApiPropertyMetadata {
  type?: () => unknown;
}

const propertyMetadata = (target: Record<never, never>, propertyKey: string): ApiPropertyMetadata =>
  Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, target, propertyKey) as ApiPropertyMetadata;

describe('ProfilePayloadDto', () => {
  it('documents its principal property as the authenticated principal DTO', () => {
    const metadata = propertyMetadata(ProfilePayloadDto.prototype, 'principal');

    expect(metadata.type?.()).toBe(AuthenticatedPrincipalDto);
  });

  it('documents its profile property as the user profile view DTO', () => {
    const metadata = propertyMetadata(ProfilePayloadDto.prototype, 'profile');

    expect(metadata.type?.()).toBe(UserProfileViewDto);
  });
});
