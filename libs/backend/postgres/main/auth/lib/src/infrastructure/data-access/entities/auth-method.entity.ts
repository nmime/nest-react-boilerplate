import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";
import type { ExternalAuthProviderChannel } from "./external-identity.entity";

export type AuthMethodType = "password" | ExternalAuthProviderChannel;

export class AuthMethodEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId!: string;
  method!: AuthMethodType;
  amr: string[] = [];
  externalIdentityId: string | null = null;
  lastUsedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const AuthMethodEntitySchema = new EntitySchema<AuthMethodEntity>({
  class: AuthMethodEntity,
  tableName: "auth_methods",
  properties: {
    id: { type: "uuid", primary: true },
    tenantId: {
      type: "uuid",
      fieldName: "tenant_id",
      default: DefaultAuthTenantId,
    },
    userId: { type: "uuid", fieldName: "auth_user_id" },
    method: { type: "varchar", length: 32 },
    amr: { type: "json", defaultRaw: "'[]'::jsonb" },
    externalIdentityId: {
      type: "uuid",
      fieldName: "external_identity_id",
      nullable: true,
    },
    lastUsedAt: {
      type: "timestamptz",
      fieldName: "last_used_at",
      nullable: true,
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
  indexes: [
    {
      name: "ix__auth_methods__tenant_id_auth_user_id",
      properties: ["tenantId", "userId"],
    },
    {
      name: "ix__auth_methods__tenant_id_auth_user_id_last_used_at",
      properties: ["tenantId", "userId", "lastUsedAt"],
    },
  ],
  checks: [
    {
      name: "ck__auth_methods__method",
      expression: `"method" in ('password', 'telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot')`,
    },
  ],
});
