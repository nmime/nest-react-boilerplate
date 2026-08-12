import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { defaultLocale, supportedLocales, type Locale } from '@app/backend-common-i18n';
import { NullableEpochDateType } from './type/nullable-epoch-date.type';

export type AuthUserThemePreference = 'system' | 'light' | 'dark';

export type AuthUserStatus = 'active' | 'disabled' | 'invited';

/**
 * Canonical avatar status on the auth user profile.
 * - "none": no avatar set
 * - "provider": avatar was set from a provider (Telegram/Discord) sync
 * - "manual": user set a custom avatar (via upload or admin)
 * - "deleted": user explicitly removed their avatar
 */
export type AuthUserAvatarStatus = 'none' | 'provider' | 'manual' | 'deleted';

export const DefaultAuthTenantId = '00000000-0000-0000-0000-000000000000';
const SupportedLocaleSqlValues = supportedLocales.map((locale) => `'${locale}'`).join(', ');

export interface AuthUserAccessPolicyInput {
  permissions?: string[];
  roles?: string[];
  status?: AuthUserStatus;
}

export interface AuthUserEntityInput extends AuthUserAccessPolicyInput {
  tenantId?: string;
  email: string | null;
  displayName?: string | null;
  passwordHash?: string;
  locale?: Locale | null;
  theme?: AuthUserThemePreference | null;
  lastLoginAt?: Date | null;
  avatarUrl?: string | null;
  avatarHash?: string | null;
  avatarStatus?: AuthUserAvatarStatus | null;
}

export class AuthUserEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  email!: string;
  displayName = '';
  passwordHash = '';
  status: AuthUserStatus = 'active';
  // Derived from normalized RBAC joins by repositories. These fields are part
  // of the domain/API view but are deliberately not persisted on auth_users.
  roles: string[] = [];
  permissions: string[] = [];
  locale: Locale = defaultLocale;
  theme: AuthUserThemePreference = 'system';
  lastLoginAt: Date = new Date(0);
  avatarUrl = '';
  avatarHash = '';
  avatarStatus: AuthUserAvatarStatus = 'none';
  /**
   * `null` means the address was never confirmed. The column itself is NOT NULL and records that
   * case as the epoch; {@link NullableEpochDateType} is where the two representations meet.
   */
  emailVerifiedAt: Date | null = null;
  /**
   * Session epoch. Every credential replacement advances it and access guards reject sessions
   * stamped with an older value, so a password reset revokes sessions that are already live.
   */
  credentialRevision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: AuthUserEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.email = input.email as string;
      this.displayName = input.displayName ?? '';
      this.passwordHash = input.passwordHash ?? '';
      this.status = input.status ?? 'active';
      this.roles = input.roles ?? [];
      this.permissions = input.permissions ?? [];
      this.locale = input.locale ?? defaultLocale;
      this.theme = input.theme ?? 'system';
      this.lastLoginAt = input.lastLoginAt ?? new Date(0);
      this.avatarUrl = input.avatarUrl ?? '';
      this.avatarHash = input.avatarHash ?? '';
      this.avatarStatus = input.avatarStatus ?? 'none';
    }
  }
}

export const AuthUserEntitySchema = new EntitySchema<AuthUserEntity>({
  class: AuthUserEntity,
  tableName: 'auth_users',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: {
      type: 'uuid',
      fieldName: 'tenant_id',
      default: DefaultAuthTenantId,
    },
    email: { type: 'varchar', length: 320, nullable: true },
    displayName: {
      type: 'varchar',
      fieldName: 'display_name',
      length: 160,
      default: '',
    },
    passwordHash: {
      type: 'varchar',
      fieldName: 'password_hash',
      length: 255,
      default: '',
    },
    status: { type: 'varchar', length: 32, default: 'active' },
    roles: { type: 'json', persist: false },
    permissions: { type: 'json', persist: false },
    locale: { type: 'varchar', length: 16, default: defaultLocale },
    theme: { type: 'varchar', length: 16, default: 'system' },
    lastLoginAt: {
      type: 'timestamptz',
      fieldName: 'last_login_at',
      defaultRaw: "'epoch'::timestamptz",
    },
    avatarUrl: {
      type: 'varchar',
      fieldName: 'avatar_url',
      length: 2048,
      default: '',
    },
    avatarHash: {
      type: 'varchar',
      fieldName: 'avatar_hash',
      length: 64,
      default: '',
    },
    avatarStatus: {
      type: 'varchar',
      fieldName: 'avatar_status',
      length: 16,
      default: 'none',
    },
    emailVerifiedAt: {
      type: NullableEpochDateType,
      fieldName: 'email_verified_at',
      defaultRaw: "'epoch'::timestamptz",
    },
    credentialRevision: {
      type: 'int',
      fieldName: 'credential_revision',
      default: 0,
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
  indexes: [{ name: 'ix__auth_users__tenant_id', properties: ['tenantId'] }],
  uniques: [
    {
      name: 'uq__auth_users__tenant_id_email_not_null',
      properties: ['tenantId', 'email'],
      where: '"email" is not null',
    },
  ],
  checks: [
    {
      name: 'ck__auth_users__locale',
      expression: `"locale" in (${SupportedLocaleSqlValues})`,
    },
    {
      name: 'ck__auth_users__avatar_status',
      expression: `"avatar_status" in ('none', 'provider', 'manual', 'deleted')`,
    },
  ],
});
