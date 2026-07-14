import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';

// ─── Better-Auth user entity ────────────────────────────────────────────
// Mirrors Better-Auth's user model with additional fields from our plugins.

export class BetterAuthUserEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  email!: string;
  name: string = '';
  image: string | null = null;
  roles: string[] = [];
  permissions: string[] = [];
  status: string = 'active';
  locale: string = 'en';
  theme: string = 'system';
  passwordHash: string = '';
  lastLoginAt: Date = new Date(0);
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const BetterAuthUserEntitySchema = new EntitySchema<BetterAuthUserEntity>({
  class: BetterAuthUserEntity,
  tableName: 'better_auth_users',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    email: { type: 'varchar', length: 320 },
    name: { type: 'varchar', length: 160, default: '' },
    image: { type: 'varchar', length: 2048, nullable: true },
    roles: { type: 'json', defaultRaw: "'[]'::jsonb" },
    permissions: { type: 'json', defaultRaw: "'[]'::jsonb" },
    status: { type: 'varchar', length: 32, default: 'active' },
    locale: { type: 'varchar', length: 16, default: 'en' },
    theme: { type: 'varchar', length: 16, default: 'system' },
    passwordHash: {
      type: 'varchar',
      fieldName: 'password_hash',
      length: 255,
      default: '',
    },
    lastLoginAt: {
      type: 'timestamptz',
      fieldName: 'last_login_at',
      defaultRaw: "'epoch'::timestamptz",
    },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [
    { name: 'ix__better_auth_users__tenant_id', properties: ['tenantId'] },
    {
      name: 'uq__better_auth_users__tenant_id_email',
      properties: ['tenantId', 'email'],
      options: { unique: true },
    },
  ],
});

// ─── Better-Auth session entity ─────────────────────────────────────────

export class BetterAuthSessionEntity {
  id: string = randomUUID();
  userId!: string;
  expiresAt!: Date;
  token!: string;
  ipAddress: string | null = null;
  userAgent: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const BetterAuthSessionEntitySchema = new EntitySchema<BetterAuthSessionEntity>({
  class: BetterAuthSessionEntity,
  tableName: 'better_auth_sessions',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    expiresAt: { type: 'timestamptz', fieldName: 'expires_at' },
    token: { type: 'varchar', length: 128 },
    ipAddress: { type: 'varchar', fieldName: 'ip_address', length: 45, nullable: true },
    userAgent: { type: 'varchar', fieldName: 'user_agent', length: 512, nullable: true },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [
    { name: 'ix__better_auth_sessions__user_id', properties: ['userId'] },
    { name: 'ix__better_auth_sessions__token', properties: ['token'] },
    { name: 'ix__better_auth_sessions__expires_at', properties: ['expiresAt'] },
  ],
  uniques: [{ name: 'uq__better_auth_sessions__token', properties: ['token'] }],
});

// ─── Better-Auth account entity ─────────────────────────────────────────

export class BetterAuthAccountEntity {
  id: string = randomUUID();
  userId!: string;
  providerId!: string;
  providerAccountId!: string;
  accessToken: string | null = null;
  refreshToken: string | null = null;
  idToken: string | null = null;
  accessTokenExpiresAt: Date | null = null;
  refreshTokenExpiresAt: Date | null = null;
  password: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const BetterAuthAccountEntitySchema = new EntitySchema<BetterAuthAccountEntity>({
  class: BetterAuthAccountEntity,
  tableName: 'better_auth_accounts',
  properties: {
    id: { type: 'uuid', primary: true },
    userId: { type: 'uuid', fieldName: 'user_id' },
    providerId: { type: 'varchar', fieldName: 'provider_id', length: 32 },
    providerAccountId: { type: 'varchar', fieldName: 'provider_account_id', length: 191 },
    accessToken: { type: 'text', fieldName: 'access_token', nullable: true },
    refreshToken: { type: 'text', fieldName: 'refresh_token', nullable: true },
    idToken: { type: 'text', fieldName: 'id_token', nullable: true },
    accessTokenExpiresAt: { type: 'timestamptz', fieldName: 'access_token_expires_at', nullable: true },
    refreshTokenExpiresAt: { type: 'timestamptz', fieldName: 'refresh_token_expires_at', nullable: true },
    password: { type: 'varchar', length: 255, nullable: true },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [
    { name: 'ix__better_auth_accounts__user_id', properties: ['userId'] },
    {
      name: 'ix__better_auth_accounts__provider_id_provider_account_id',
      properties: ['providerId', 'providerAccountId'],
    },
  ],
  uniques: [
    {
      name: 'uq__better_auth_accounts__provider_id_provider_account_id',
      properties: ['providerId', 'providerAccountId'],
    },
  ],
});

// ─── Better-Auth verification entity ────────────────────────────────────

export class BetterAuthVerificationEntity {
  id: string = randomUUID();
  identifier!: string;
  value!: string;
  expiresAt!: Date;
  consumedAt: Date | null = null;
}

export const BetterAuthVerificationEntitySchema = new EntitySchema<BetterAuthVerificationEntity>({
  class: BetterAuthVerificationEntity,
  tableName: 'better_auth_verification',
  properties: {
    id: { type: 'uuid', primary: true },
    identifier: { type: 'varchar', length: 256 },
    value: { type: 'text' },
    expiresAt: { type: 'timestamptz', fieldName: 'expires_at' },
    consumedAt: { type: 'timestamptz', fieldName: 'consumed_at', nullable: true },
  },
  indexes: [
    {
      name: 'ix__better_auth_verification__identifier',
      properties: ['identifier'],
    },
    {
      name: 'ix__better_auth_verification__expires_at',
      properties: ['expiresAt'],
    },
  ],
});
