import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import type { Locale } from "@app/common-i18n";

export type AuthUserThemePreference = "system" | "light" | "dark";

export type AuthUserStatus = "active" | "disabled" | "invited";

/**
 * Canonical avatar status on the auth user profile.
 * - "none": no avatar set
 * - "provider": avatar was set from a provider (Telegram/Discord) sync
 * - "manual": user set a custom avatar (via upload or admin)
 * - "deleted": user explicitly removed their avatar
 */
export type AuthUserAvatarStatus = "none" | "provider" | "manual" | "deleted";

export const DefaultAuthTenantId = "00000000-0000-0000-0000-000000000000";

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
  displayName = "";
  passwordHash = "";
  status: AuthUserStatus = "active";
  roles: string[] = [];
  permissions: string[] = [];
  locale: Locale = "en";
  theme: AuthUserThemePreference = "system";
  lastLoginAt: Date = new Date(0);
  avatarUrl: string | null = null;
  avatarHash: string | null = null;
  avatarStatus: AuthUserAvatarStatus = "none";
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: AuthUserEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.email = input.email as string;
      this.displayName = input.displayName ?? "";
      this.passwordHash = input.passwordHash ?? "";
      this.status = input.status ?? "active";
      this.roles = input.roles ?? [];
      this.permissions = input.permissions ?? [];
      this.locale = input.locale ?? "en";
      this.theme = input.theme ?? "system";
      this.lastLoginAt = input.lastLoginAt ?? new Date(0);
      this.avatarUrl = input.avatarUrl ?? null;
      this.avatarHash = input.avatarHash ?? null;
      this.avatarStatus = input.avatarStatus ?? "none";
    }
  }
}

export const AuthUserEntitySchema = new EntitySchema<AuthUserEntity>({
  class: AuthUserEntity,
  tableName: "auth_users",
  properties: {
    id: { type: "uuid", primary: true },
    tenantId: {
      type: "uuid",
      fieldName: "tenant_id",
      default: DefaultAuthTenantId,
    },
    email: { type: "varchar", length: 320, nullable: true },
    displayName: {
      type: "varchar",
      fieldName: "display_name",
      length: 160,
      default: "",
    },
    passwordHash: {
      type: "varchar",
      fieldName: "password_hash",
      length: 255,
      default: "",
    },
    status: { type: "varchar", length: 32, default: "active" },
    roles: { type: "json", defaultRaw: "'[]'::jsonb" },
    permissions: { type: "json", defaultRaw: "'[]'::jsonb" },
    locale: { type: "varchar", length: 16, default: "en" },
    theme: { type: "varchar", length: 16, default: "system" },
    lastLoginAt: {
      type: "timestamptz",
      fieldName: "last_login_at",
      defaultRaw: "'epoch'::timestamptz",
    },
    avatarUrl: {
      type: "varchar",
      fieldName: "avatar_url",
      length: 2048,
      nullable: true,
    },
    avatarHash: {
      type: "varchar",
      fieldName: "avatar_hash",
      length: 64,
      nullable: true,
    },
    avatarStatus: {
      type: "varchar",
      fieldName: "avatar_status",
      length: 16,
      default: "none",
    },
    createdAt: {
      type: "timestamptz",
      fieldName: "created_at",
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: "timestamptz",
      fieldName: "updated_at",
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [{ name: "ix__auth_users__tenant_id", properties: ["tenantId"] }],
  uniques: [
    {
      name: "uq__auth_users__tenant_id_email_not_null",
      properties: ["tenantId", "email"],
      where: '"email" is not null',
    },
  ],
  checks: [
    {
      name: "ck__auth_users__locale",
      expression: `"locale" in ('en', 'ru')`,
    },
    {
      name: "ck__auth_users__avatar_status",
      expression: `"avatar_status" in ('none', 'provider', 'manual', 'deleted')`,
    },
  ],
});
