import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthProvider, AuthProviderChannel } from '@app/backend-feature-auth-shared';
import { DefaultTelegramMaxAgeSeconds } from '../const/external-auth.const';
import type { VerifiedExternalProfile } from '../type/external-auth-internal.type';
import { readPositiveInt } from './external-auth.util';

export function verifyTelegramWebLoginPayload(
  payload: Record<string, string | number | boolean | null | undefined>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedExternalProfile {
  const hash = String(payload.hash ?? '');
  if (!hash) {
    throw new UnauthorizedException('invalid_signature');
  }
  const dataCheckString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
  const secret = createHash('sha256').update(botToken, 'utf8').digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const provided = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    throw new UnauthorizedException('invalid_signature');
  }
  const authDate = Number(payload.auth_date);
  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    nowSeconds - authDate >
      readPositiveInt(process.env.TELEGRAM_WEB_LOGIN_MAX_AGE_SECONDS, DefaultTelegramMaxAgeSeconds)
  ) {
    throw new UnauthorizedException('invalid_signature');
  }
  const id = payload.id;
  if (id === undefined || id === null || String(id).trim().length === 0) {
    throw new BadRequestException('invalid_signature');
  }
  const displayName = [payload.first_name, payload.last_name].filter(Boolean).map(String).join(' ') || null;
  return {
    provider: AuthProvider.Telegram,
    channel: AuthProviderChannel.TelegramWebLogin,
    providerSubject: String(id),
    displayName,
    username: payload.username ? String(payload.username) : null,
    avatarUrl: payload.photo_url ? String(payload.photo_url) : null,
    metadata: { source: 'telegram_web_login' },
  };
}
