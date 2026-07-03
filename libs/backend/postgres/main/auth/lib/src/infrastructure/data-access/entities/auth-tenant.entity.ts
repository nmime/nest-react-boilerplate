import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";

export type AuthTenantStatus = "active" | "suspended" | "deleted";
export type AuthTenantRole = "owner" | "admin" | "member" | "billing";
export type AuthTenantInvitationStatus =
  "pending" | "accepted" | "revoked" | "expired";

export class AuthTenantEntity {
  id: string = randomUUID();
  slug!: string;
  name!: string;
  primaryDomain = "";
  status: AuthTenantStatus = "active";
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export class AuthTenantMembershipEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  roles: AuthTenantRole[] = ["member"];
  isDefault = false;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export class AuthTenantInvitationEntity {
  id: string = randomUUID();
  tenantId!: string;
  email!: string;
  roles: AuthTenantRole[] = ["member"];
  status: AuthTenantInvitationStatus = "pending";
  tokenHash!: string;
  invitedByUserId = "00000000-0000-0000-0000-000000000000";
  expiresAt: Date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  acceptedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const AuthTenantEntitySchema = new EntitySchema<AuthTenantEntity>({
  class: AuthTenantEntity,
  tableName: "auth_tenants",
  properties: {
    id: { type: "uuid", primary: true },
    slug: { type: "varchar", length: 64 },
    name: { type: "varchar", length: 160 },
    primaryDomain: {
      type: "varchar",
      fieldName: "primary_domain",
      length: 253,
      default: "",
    },
    status: { type: "varchar", length: 32, default: "active" },
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
  uniques: [
    { name: "uq__auth_tenants__slug", properties: ["slug"] },
    {
      name: "uq__auth_tenants__primary_domain",
      properties: ["primaryDomain"],
      where: "\"primary_domain\" <> ''",
    },
  ],
  checks: [
    {
      name: "ck__auth_tenants__status",
      expression: "\"status\" in ('active', 'suspended', 'deleted')",
    },
  ],
});

export const AuthTenantMembershipEntitySchema =
  new EntitySchema<AuthTenantMembershipEntity>({
    class: AuthTenantMembershipEntity,
    tableName: "auth_tenant_memberships",
    properties: {
      id: { type: "uuid", primary: true },
      tenantId: { type: "uuid", fieldName: "tenant_id" },
      userId: { type: "uuid", fieldName: "user_id" },
      roles: { type: "json", defaultRaw: `'["member"]'::jsonb` },
      isDefault: {
        type: "boolean",
        fieldName: "is_default",
        default: false,
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
        name: "ix__auth_tenant_memberships__user_id",
        properties: ["userId"],
      },
      {
        name: "ix__auth_tenant_memberships__tenant_id",
        properties: ["tenantId"],
      },
    ],
    uniques: [
      {
        name: "uq__auth_tenant_memberships__tenant_id_user_id",
        properties: ["tenantId", "userId"],
      },
    ],
  });

export const AuthTenantInvitationEntitySchema =
  new EntitySchema<AuthTenantInvitationEntity>({
    class: AuthTenantInvitationEntity,
    tableName: "auth_tenant_invitations",
    properties: {
      id: { type: "uuid", primary: true },
      tenantId: { type: "uuid", fieldName: "tenant_id" },
      email: { type: "varchar", length: 320 },
      roles: { type: "json", defaultRaw: `'["member"]'::jsonb` },
      status: { type: "varchar", length: 32, default: "pending" },
      tokenHash: { type: "varchar", fieldName: "token_hash", length: 128 },
      invitedByUserId: {
        type: "uuid",
        fieldName: "invited_by_user_id",
        default: "00000000-0000-0000-0000-000000000000",
      },
      expiresAt: { type: "timestamptz", fieldName: "expires_at" },
      acceptedAt: {
        type: "timestamptz",
        fieldName: "accepted_at",
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
        name: "ix__auth_tenant_invitations__tenant_id",
        properties: ["tenantId"],
      },
      { name: "ix__auth_tenant_invitations__email", properties: ["email"] },
    ],
    uniques: [
      {
        name: "uq__auth_tenant_invitations__token_hash",
        properties: ["tokenHash"],
      },
    ],
    checks: [
      {
        name: "ck__auth_tenant_invitations__status",
        expression:
          "\"status\" in ('pending', 'accepted', 'revoked', 'expired')",
      },
    ],
  });
