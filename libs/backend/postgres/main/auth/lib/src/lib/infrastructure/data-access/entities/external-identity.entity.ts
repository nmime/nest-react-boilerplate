import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";
import { DefaultAuthTenantId } from "./auth-user.entity";

export const externalAuthProviders = ["telegram", "discord"] as const;
export type ExternalAuthProvider = (typeof externalAuthProviders)[number];

export const externalAuthProviderChannels = [
  "telegram_web_login",
  "telegram_tma",
  "telegram_bot",
  "discord_oauth",
  "discord_bot",
] as const;
export type ExternalAuthProviderChannel =
  (typeof externalAuthProviderChannels)[number];

export class ExternalIdentityEntity {
  id: string = randomUUID();
  tenantId: string = DefaultAuthTenantId;
  userId!: string;
  provider!: ExternalAuthProvider;
  providerSubject!: string;
  channel!: ExternalAuthProviderChannel;
  profileMetadata: Record<string, unknown> = {};
  email: string | null = null;
  emailVerified: boolean | null = null;
  locale: string | null = null;
  avatarUrl: string | null = null;
  displayName: string | null = null;
  username: string | null = null;
  lastAuthenticatedAt: Date | null = null;
  linkedAt: Date = new Date();
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ExternalIdentityEntitySchema =
  new EntitySchema<ExternalIdentityEntity>({
    class: ExternalIdentityEntity,
    tableName: "auth_external_identities",
    properties: {
      id: { type: "uuid", primary: true },
      tenantId: {
        type: "uuid",
        fieldName: "tenant_id",
        default: DefaultAuthTenantId,
      },
      userId: { type: "uuid", fieldName: "auth_user_id" },
      provider: { type: "varchar", length: 32 },
      providerSubject: {
        type: "varchar",
        fieldName: "provider_subject",
        length: 191,
      },
      channel: { type: "varchar", length: 32 },
      profileMetadata: {
        type: "json",
        fieldName: "profile_metadata",
        defaultRaw: "'{}'::jsonb",
      },
      email: { type: "varchar", length: 320, nullable: true },
      emailVerified: {
        type: "boolean",
        fieldName: "email_verified",
        nullable: true,
      },
      locale: { type: "varchar", length: 32, nullable: true },
      avatarUrl: {
        type: "varchar",
        fieldName: "avatar_url",
        length: 2048,
        nullable: true,
      },
      displayName: {
        type: "varchar",
        fieldName: "display_name",
        length: 160,
        nullable: true,
      },
      username: { type: "varchar", length: 191, nullable: true },
      lastAuthenticatedAt: {
        type: "timestamptz",
        fieldName: "last_authenticated_at",
        nullable: true,
      },
      linkedAt: { type: "timestamptz", fieldName: "linked_at" },
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
        name: "ix__auth_external_identities__tenant_id_auth_user_id",
        properties: ["tenantId", "userId"],
      },
      {
        name: "ix__auth_external_identities__provider_channel",
        properties: ["provider", "channel"],
      },
    ],
    uniques: [
      {
        name: "uq__auth_external_identities__tenant_provider_subject",
        properties: ["tenantId", "provider", "providerSubject"],
      },
    ],
    checks: [
      {
        name: "ck__auth_external_identities__provider",
        expression: `"provider" in ('telegram', 'discord')`,
      },
      {
        name: "ck__auth_external_identities__channel",
        expression: `"channel" in ('telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot')`,
      },
    ],
  });
