// @requirements REQ-AUTH-TENANT-004
import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '@app/backend-common-validation';
import { describe, expect, it } from 'vitest';
import {
  LoginDto,
  PasswordResetConfirmDto,
  RegisterDto,
  UserActionTokenConfirmDto,
  UserActionTokenRequestDto,
} from './local-auth.dto';

const legacyTenantId = '11111111-1111-4111-8111-111111111111';
const publicAuthDtos = [
  {
    metatype: RegisterDto,
    payload: { email: 'user@example.com', password: 'password123' },
  },
  {
    metatype: LoginDto,
    payload: { email: 'user@example.com', password: 'password123' },
  },
  {
    metatype: UserActionTokenRequestDto,
    payload: { email: 'user@example.com' },
  },
  {
    metatype: UserActionTokenConfirmDto,
    payload: { token: 'verification-token' },
  },
  {
    metatype: PasswordResetConfirmDto,
    payload: { token: 'reset-token', password: 'password123' },
  },
] as const;

describe('public local-auth DTO tenant boundary', () => {
  it.each(publicAuthDtos)(
    'accepts the deprecated $metatype.name tenant field for compatibility while application services ignore it',
    async ({ metatype, payload }) => {
      const body: ArgumentMetadata = {
        data: undefined,
        metatype,
        type: 'body',
      };

      await expect(
        createValidationPipe().transform(
          {
            ...payload,
            tenantId: legacyTenantId,
          },
          body,
        ),
      ).resolves.toMatchObject({ tenantId: legacyTenantId, ...payload });
    },
  );
});
