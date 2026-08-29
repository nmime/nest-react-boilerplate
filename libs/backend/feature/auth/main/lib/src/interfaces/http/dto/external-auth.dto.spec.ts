// @requirements REQ-AUTH-TENANT-004
import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '@app/backend-common-validation';
import { AuthProvider } from '@app/backend-feature-auth-shared';
import { describe, expect, it } from 'vitest';
import {
  DiscordAuthorizationRequestDto,
  DiscordCallbackQueryDto,
  LinkTokenDto,
  TelegramBotLinkDto,
  TelegramOidcSessionDto,
  TelegramTmaDto,
} from './external-auth.dto';

const legacyTenantId = '11111111-1111-4111-8111-111111111111';
const publicExternalAuthDtos = [
  { metatype: TelegramTmaDto, payload: { initData: 'signed-telegram-data' }, kind: 'body' },
  { metatype: TelegramOidcSessionDto, payload: {}, kind: 'body' },
  {
    metatype: TelegramBotLinkDto,
    payload: { linkToken: 'link-token', providerSubject: '42' },
    kind: 'body',
  },
  { metatype: DiscordAuthorizationRequestDto, payload: {}, kind: 'body' },
  {
    metatype: DiscordCallbackQueryDto,
    payload: { code: 'authorization-code', state: 'oauth-state' },
    kind: 'query',
  },
  { metatype: LinkTokenDto, payload: { provider: AuthProvider.Telegram }, kind: 'body' },
] as const;

describe('public external-auth DTO tenant boundary', () => {
  it.each(publicExternalAuthDtos)(
    'accepts the deprecated $metatype.name tenant field for compatibility while trusted principal, state, or token ownership wins',
    async ({ metatype, payload, kind }) => {
      const metadata: ArgumentMetadata = {
        data: undefined,
        metatype,
        type: kind,
      };

      await expect(
        createValidationPipe().transform(
          {
            ...payload,
            tenantId: legacyTenantId,
          },
          metadata,
        ),
      ).resolves.toMatchObject({ tenantId: legacyTenantId, ...payload });
    },
  );
});
