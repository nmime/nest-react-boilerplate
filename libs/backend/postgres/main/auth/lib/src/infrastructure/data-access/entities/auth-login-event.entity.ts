import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from './auth-user.entity';

export const AuthLoginEventTypes = ['login', 'registration'] as const;
export type AuthLoginEventType = (typeof AuthLoginEventTypes)[number];

export const AuthLoginOutcomes = ['success', 'failure'] as const;
export type AuthLoginOutcome = (typeof AuthLoginOutcomes)[number];

export interface AuthLoginEventEntityInput {
  tenantId?: string;
  userId?: string | null;
  identifierHash?: string | null;
  sessionId?: string | null;
  eventType: AuthLoginEventType;
  outcome: AuthLoginOutcome;
  provider: string;
  channel: string;
  failureCode?: string | null;
  ipAddress?: string | null;
  ipHash?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  language?: string | null;
  languageSource?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  occurredAt?: Date;
  networkAnonymizedAt?: Date | null;
}

/**
 * Append-only security analytics for every session-establishing auth flow.
 * Exact network data is deliberately nullable so retention can anonymize it
 * without deleting the durable aggregate dimensions.
 */
export class AuthLoginEventEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId: string | null = null;
  identifierHash: string | null = null;
  sessionId: string | null = null;
  eventType!: AuthLoginEventType;
  outcome!: AuthLoginOutcome;
  provider!: string;
  channel!: string;
  failureCode: string | null = null;
  ipAddress: string | null = null;
  ipHash: string | null = null;
  countryCode: string | null = null;
  region: string | null = null;
  city: string | null = null;
  timezone: string | null = null;
  timezoneSource: string | null = null;
  language: string | null = null;
  languageSource: string | null = null;
  userAgent: string | null = null;
  requestId: string | null = null;
  occurredAt: Date = new Date();
  networkAnonymizedAt: Date | null = null;

  constructor(input?: AuthLoginEventEntityInput) {
    if (!input) {
      return;
    }
    this.tenantId = input.tenantId ?? DefaultAuthTenantId;
    this.userId = input.userId ?? null;
    this.identifierHash = input.identifierHash ?? null;
    this.sessionId = input.sessionId ?? null;
    this.eventType = input.eventType;
    this.outcome = input.outcome;
    this.provider = input.provider;
    this.channel = input.channel;
    this.failureCode = input.failureCode ?? null;
    this.ipAddress = input.ipAddress ?? null;
    this.ipHash = input.ipHash ?? null;
    this.countryCode = input.countryCode ?? null;
    this.region = input.region ?? null;
    this.city = input.city ?? null;
    this.timezone = input.timezone ?? null;
    this.timezoneSource = input.timezoneSource ?? null;
    this.language = input.language ?? null;
    this.languageSource = input.languageSource ?? null;
    this.userAgent = input.userAgent ?? null;
    this.requestId = input.requestId ?? null;
    this.occurredAt = input.occurredAt ?? new Date();
    this.networkAnonymizedAt = input.networkAnonymizedAt ?? null;
  }
}

export const AuthLoginEventEntitySchema = new EntitySchema<AuthLoginEventEntity>({
  class: AuthLoginEventEntity,
  tableName: 'auth_login_events',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id', default: DefaultAuthTenantId },
    userId: { type: 'uuid', fieldName: 'user_id', nullable: true },
    identifierHash: { type: 'varchar', fieldName: 'identifier_hash', length: 64, nullable: true },
    sessionId: { type: 'varchar', fieldName: 'session_id', length: 128, nullable: true },
    eventType: { type: 'varchar', fieldName: 'event_type', length: 32 },
    outcome: { type: 'varchar', length: 16 },
    provider: { type: 'varchar', length: 32 },
    channel: { type: 'varchar', length: 64 },
    failureCode: { type: 'varchar', fieldName: 'failure_code', length: 64, nullable: true },
    ipAddress: { type: 'varchar', fieldName: 'ip_address', length: 45, nullable: true },
    ipHash: { type: 'varchar', fieldName: 'ip_hash', length: 64, nullable: true },
    countryCode: { type: 'varchar', fieldName: 'country_code', length: 2, nullable: true },
    region: { type: 'varchar', length: 128, nullable: true },
    city: { type: 'varchar', length: 128, nullable: true },
    timezone: { type: 'varchar', length: 64, nullable: true },
    timezoneSource: { type: 'varchar', fieldName: 'timezone_source', length: 16, nullable: true },
    language: { type: 'varchar', length: 35, nullable: true },
    languageSource: { type: 'varchar', fieldName: 'language_source', length: 16, nullable: true },
    userAgent: { type: 'varchar', fieldName: 'user_agent', length: 512, nullable: true },
    requestId: { type: 'varchar', fieldName: 'request_id', length: 128, nullable: true },
    occurredAt: { type: 'timestamptz', fieldName: 'occurred_at', onCreate: () => new Date() },
    networkAnonymizedAt: { type: 'timestamptz', fieldName: 'network_anonymized_at', nullable: true },
  },
  indexes: [
    { name: 'ix__auth_login_events__tenant_id_occurred_at', properties: ['tenantId', 'occurredAt'] },
    { name: 'ix__auth_login_events__tenant_id_user_id_occurred_at', properties: ['tenantId', 'userId', 'occurredAt'] },
    { name: 'ix__auth_login_events__tenant_id_outcome_occurred_at', properties: ['tenantId', 'outcome', 'occurredAt'] },
    {
      name: 'ix__auth_login_events__tenant_id_country_code_occurred_at',
      properties: ['tenantId', 'countryCode', 'occurredAt'],
    },
    {
      name: 'ix__auth_login_events__tenant_id_language_occurred_at',
      properties: ['tenantId', 'language', 'occurredAt'],
    },
    {
      name: 'ix__auth_login_events__tenant_id_timezone_occurred_at',
      properties: ['tenantId', 'timezone', 'occurredAt'],
    },
  ],
});
