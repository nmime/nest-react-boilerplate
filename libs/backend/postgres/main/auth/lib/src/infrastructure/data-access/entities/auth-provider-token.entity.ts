import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";
import type { ExternalAuthProvider } from "./external-identity.entity";

export type AuthProviderTokenKind = "access" | "refresh";

export interface RedactedAuthProviderTokenView {
  id: string;
  tenantId: string;
  userId: string;
  externalIdentityId: string;
  provider: ExternalAuthProvider;
  tokenKind: AuthProviderTokenKind;
  keyId: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  redacted: true;
}

export class AuthProviderTokenEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId!: string;
  externalIdentityId!: string;
  provider: ExternalAuthProvider = "discord";
  tokenKind!: AuthProviderTokenKind;
  ciphertext!: string;
  iv!: string;
  authTag!: string;
  keyId!: string;
  scopes: string[] = [];
  expiresAt: Date | null = null;
  revokedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export function toRedactedAuthProviderTokenView(
  entity: AuthProviderTokenEntity,
): RedactedAuthProviderTokenView {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    externalIdentityId: entity.externalIdentityId,
    provider: entity.provider,
    tokenKind: entity.tokenKind,
    keyId: entity.keyId,
    scopes: entity.scopes,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    redacted: true,
  };
}

export const AuthProviderTokenEntitySchema =
  new EntitySchema<AuthProviderTokenEntity>({
    class: AuthProviderTokenEntity,
    tableName: "auth_provider_tokens",
    properties: {
      id: { type: "uuid", primary: true },
      tenantId: {
        type: "uuid",
        fieldName: "tenant_id",
        default: DefaultAuthTenantId,
      },
      userId: { type: "uuid", fieldName: "auth_user_id" },
      externalIdentityId: {
        type: "uuid",
        fieldName: "external_identity_id",
      },
      provider: { type: "varchar", length: 32, default: "discord" },
      tokenKind: { type: "varchar", fieldName: "token_kind", length: 16 },
      ciphertext: { type: "text" },
      iv: { type: "varchar", length: 64 },
      authTag: { type: "varchar", fieldName: "auth_tag", length: 64 },
      keyId: { type: "varchar", fieldName: "key_id", length: 128 },
      scopes: { type: "json", defaultRaw: "'[]'::jsonb" },
      expiresAt: {
        type: "timestamptz",
        fieldName: "expires_at",
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
        name: "ix__auth_provider_tokens__tenant_id_auth_user_id",
        properties: ["tenantId", "userId"],
      },
      {
        name: "ix__auth_provider_tokens__external_identity_id",
        properties: ["externalIdentityId"],
      },
      {
        name: "ix__auth_provider_tokens__expires_at",
        properties: ["expiresAt"],
      },
    ],
    checks: [
      {
        name: "ck__auth_provider_tokens__provider",
        expression: `"provider" in ('discord')`,
      },
      {
        name: "ck__auth_provider_tokens__token_kind",
        expression: `"token_kind" in ('access', 'refresh')`,
      },
    ],
  });
