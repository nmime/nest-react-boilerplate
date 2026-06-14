import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";
import type { ExternalAuthProvider } from "./external-identity.entity";

export type AuthLinkTokenPurpose = "login" | "link";

export class AuthLinkTokenEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId: string | null = null;
  provider!: ExternalAuthProvider;
  purpose!: AuthLinkTokenPurpose;
  tokenHash!: string;
  nonce: string | null = null;
  deepLinkMetadata: Record<string, unknown> = {};
  expiresAt!: Date;
  consumedAt: Date | null = null;
  revokedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const AuthLinkTokenEntitySchema = new EntitySchema<AuthLinkTokenEntity>({
  class: AuthLinkTokenEntity,
  tableName: "auth_link_tokens",
  properties: {
    id: { type: "uuid", primary: true },
    tenantId: {
      type: "uuid",
      fieldName: "tenant_id",
      default: DefaultAuthTenantId,
    },
    userId: { type: "uuid", fieldName: "auth_user_id", nullable: true },
    provider: { type: "varchar", length: 32 },
    purpose: { type: "varchar", length: 16 },
    tokenHash: { type: "varchar", fieldName: "token_hash", length: 128 },
    nonce: { type: "varchar", length: 191, nullable: true },
    deepLinkMetadata: {
      type: "json",
      fieldName: "deep_link_metadata",
      defaultRaw: "'{}'::jsonb",
    },
    expiresAt: { type: "timestamptz", fieldName: "expires_at" },
    consumedAt: {
      type: "timestamptz",
      fieldName: "consumed_at",
      nullable: true,
    },
    revokedAt: {
      type: "timestamptz",
      fieldName: "revoked_at",
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
      name: "ix__auth_link_tokens__tenant_id_auth_user_id",
      properties: ["tenantId", "userId"],
    },
    { name: "ix__auth_link_tokens__expires_at", properties: ["expiresAt"] },
  ],
  uniques: [
    { name: "uq__auth_link_tokens__token_hash", properties: ["tokenHash"] },
  ],
  checks: [
    {
      name: "ck__auth_link_tokens__provider",
      expression: `"provider" in ('telegram', 'discord')`,
    },
    {
      name: "ck__auth_link_tokens__purpose",
      expression: `"purpose" in ('login', 'link')`,
    },
  ],
});
