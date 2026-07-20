import { createHash } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExternalAuthProvider } from '@app/backend-feature-auth-shared';

export function assertProviderEnabled(provider: ExternalAuthProvider): void {
  const canonicalName = `AUTH_${provider.toUpperCase()}_ENABLED`;
  const legacyName = `${provider.toUpperCase()}_AUTH_ENABLED`;
  const value = process.env[canonicalName] ?? process.env[legacyName];
  if (value === 'false') {
    throw new ForbiddenException('provider_disabled');
  }
}

export function requireEnv(name: string, code: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new UnauthorizedException(code);
  }
  return value;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readPositiveInt(value: string | undefined, fallback: number): number {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/u.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readList(value: string | undefined): string[] | null {
  const items =
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return items.length > 0 ? items : null;
}

export function isRecentAuthTime(authTime: number | undefined): boolean {
  if (typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime <= 0) {
    return false;
  }
  const maxAge = readPositiveInt(process.env.EXTERNAL_AUTH_STEP_UP_MAX_AGE_SECONDS, 15 * 60);
  const age = Math.floor(Date.now() / 1000) - authTime;
  return age >= 0 && age <= maxAge;
}
