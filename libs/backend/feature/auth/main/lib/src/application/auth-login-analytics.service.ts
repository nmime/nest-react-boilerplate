import { createHmac } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { requestContext } from '@app/backend-common-request-context';
import { resolveTenantId, type AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import {
  AuthLoginEventRepository,
  type AuthLoginEventType,
  type AuthLoginOutcome,
} from '@app/backend-postgres-main-auth';
import { GeoIpResolverService } from './geo-ip-resolver.service';

export interface AuthLoginAnalyticsRecordInput {
  request: AuthenticatedRequest;
  tenantId?: string | null;
  userId?: string | null;
  identifier?: string | null;
  sessionId?: string | null;
  eventType: AuthLoginEventType;
  outcome: AuthLoginOutcome;
  provider: string;
  channel: string;
  language?: string | null;
  failureCode?: string | null;
}

@Injectable()
export class AuthLoginAnalyticsService {
  private readonly logger = new Logger(AuthLoginAnalyticsService.name);
  private nextRetentionAt = 0;

  constructor(
    private readonly geoIp: GeoIpResolverService,
    @Optional() private readonly events?: AuthLoginEventRepository,
  ) {}

  /** Analytics is security evidence, but an analytics outage must never mint a
   * half-established client session or turn correct credentials into a login
   * failure. Persistence failures are therefore awaited and logged, then the
   * auth response proceeds. Each successful insert has its own outbox event. */
  async record(input: AuthLoginAnalyticsRecordInput): Promise<void> {
    if (!this.events) {
      return;
    }
    const ipAddress = resolveRequestIp(input.request);
    const geo = await this.geoIp.resolve(ipAddress);
    const clientTimezone = normalizeTimezone(readHeader(input.request, 'x-client-timezone'));
    const explicitLanguage = normalizeLanguage(input.language);
    const requestLanguage = normalizeAcceptLanguage(readHeader(input.request, 'accept-language'));
    const language = explicitLanguage ?? requestLanguage;
    let timezoneSource = 'unknown';
    if (clientTimezone) {
      timezoneSource = 'client';
    } else if (geo.timezone) {
      timezoneSource = 'geoip';
    }
    let languageSource = 'unknown';
    if (explicitLanguage) {
      languageSource = 'user';
    } else if (requestLanguage) {
      languageSource = 'request';
    }
    const result = await this.events.record({
      tenantId: resolveTenantId(input.tenantId),
      userId: input.userId,
      identifierHash: hmacValue(input.identifier),
      sessionId: input.sessionId,
      eventType: input.eventType,
      outcome: input.outcome,
      provider: sanitizeDimension(input.provider, 32) ?? 'unknown',
      channel: sanitizeDimension(input.channel, 64) ?? 'unknown',
      failureCode: sanitizeDimension(input.failureCode, 64),
      ipAddress,
      ipHash: hmacValue(ipAddress),
      countryCode: geo.countryCode,
      region: sanitizeDimension(geo.region, 128),
      city: sanitizeDimension(geo.city, 128),
      timezone: clientTimezone ?? geo.timezone,
      timezoneSource,
      language,
      languageSource,
      userAgent: sanitizeDimension(readHeader(input.request, 'user-agent'), 512),
      requestId: requestContext.getRequestId(),
    });
    if (result.isErr()) {
      this.logger.error(`Auth login analytics persistence failed: ${result.error.message}`);
      return;
    }
    await this.runRetentionIfDue(resolveTenantId(input.tenantId));
  }

  private async runRetentionIfDue(tenantId: string): Promise<void> {
    const nowMs = Date.now();
    if (!this.events || nowMs < this.nextRetentionAt) {
      return;
    }
    this.nextRetentionAt = nowMs + 60 * 60 * 1000;
    const networkDays = readRetentionDays('AUTH_LOGIN_NETWORK_RETENTION_DAYS', 30, 1, 365);
    const eventDays = readRetentionDays('AUTH_LOGIN_EVENT_RETENTION_DAYS', 365, networkDays, 3650);
    try {
      await this.events.applyRetention({
        tenantId,
        anonymizeBefore: new Date(nowMs - networkDays * 86_400_000),
        deleteBefore: new Date(nowMs - eventDays * 86_400_000),
        now: new Date(nowMs),
      });
    } catch (error) {
      this.logger.error(
        `Auth login analytics retention failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const resolveRequestIp = (request: AuthenticatedRequest): string | undefined => {
  const direct = request.ip?.trim();
  if (direct) {
    return direct.startsWith('::ffff:') ? direct.slice(7) : direct;
  }
  const socketAddress = request.socket?.remoteAddress?.trim();
  return socketAddress?.startsWith('::ffff:') ? socketAddress.slice(7) : socketAddress;
};

const readHeader = (request: AuthenticatedRequest, name: string): string | undefined => {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeAcceptLanguage = (value: string | undefined): string | undefined =>
  normalizeLanguage(value?.split(',')[0]?.split(';')[0]);

const normalizeLanguage = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim().replace(/_/gu, '-');
  return normalized && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(normalized)
    ? normalized.slice(0, 35).toLowerCase()
    : undefined;
};

const normalizeTimezone = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 64) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format();
    return normalized;
  } catch {
    return undefined;
  }
};

const sanitizeDimension = (value: string | null | undefined, max: number, fallback?: string): string | undefined =>
  value?.trim().slice(0, max) || fallback;

const hmacValue = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  const secret =
    process.env.AUTH_LOGIN_ANALYTICS_IP_HASH_SECRET?.trim() ||
    process.env.AUTH_JWT_SECRET?.trim() ||
    'development-only-auth-login-analytics-secret';
  return createHmac('sha256', secret).update(normalized).digest('hex');
};

const readRetentionDays = (name: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};
