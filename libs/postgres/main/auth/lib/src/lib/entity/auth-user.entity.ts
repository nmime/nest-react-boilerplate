import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import type { Locale } from "@app/common/i18n";

export type AuthUserThemePreference = "system" | "light" | "dark";

export type AuthUserStatus = "active" | "disabled" | "invited";

export const DefaultAuthTenantId = "00000000-0000-0000-0000-000000000000";

export interface AuthUserAccessPolicyInput {
  permissions?: string[];
  roles?: string[];
  status?: AuthUserStatus;
}

export interface AuthUserEntityInput extends AuthUserAccessPolicyInput {
  tenantId?: string;
  email: string;
  displayName?: string | null;
  passwordHash?: string;
  locale?: Locale | null;
  theme?: AuthUserThemePreference | null;
  lastLoginAt?: Date | null;
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
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: AuthUserEntityInput) {
    if (input) {
      this.tenantId = input.tenantId ?? DefaultAuthTenantId;
      this.email = input.email;
      this.displayName = input.displayName ?? "";
      this.passwordHash = input.passwordHash ?? "";
      this.status = input.status ?? "active";
      this.roles = input.roles ?? [];
      this.permissions = input.permissions ?? [];
      this.locale = input.locale ?? "en";
      this.theme = input.theme ?? "system";
      this.lastLoginAt = input.lastLoginAt ?? new Date(0);
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
    email: { type: "varchar", length: 320 },
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
      name: "uq__auth_users__tenant_id_email",
      properties: ["tenantId", "email"],
    },
  ],
});
