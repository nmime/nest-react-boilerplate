import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  AuthTenantEntity,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntity,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntity,
  AuthTenantMembershipEntitySchema,
} from "./auth-tenant.entity";

describe("Auth tenant lifecycle entities", () => {
  it("defaults tenant, membership, and invitation lifecycle values", () => {
    expect(new AuthTenantEntity()).toMatchObject({
      primaryDomain: "",
      status: "active",
    });
    expect(new AuthTenantMembershipEntity()).toMatchObject({
      roles: ["member"],
      isDefault: false,
    });
    expect(new AuthTenantInvitationEntity()).toMatchObject({
      roles: ["member"],
      status: "pending",
      invitedByUserId: "00000000-0000-0000-0000-000000000000",
      acceptedAt: null,
    });
  });

  it("registers tenant table constraints that mirror lifecycle migrations", () => {
    AuthTenantEntitySchema.init();
    const metadata = AuthTenantEntitySchema.meta;

    expect(metadata.tableName).toBe("auth_tenants");
    expect(metadata.properties.primaryDomain.fieldNames).toContain(
      "primary_domain",
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_tenants__slug",
        properties: ["slug"],
      }),
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_tenants__primary_domain",
        properties: ["primaryDomain"],
        where: "\"primary_domain\" <> ''",
      }),
    );
    expect(metadata.checks).toContainEqual(
      expect.objectContaining({
        name: "ck__auth_tenants__status",
        expression: "\"status\" in ('active', 'suspended', 'deleted')",
      }),
    );
  });

  it("registers membership table uniqueness and lookup indexes", () => {
    AuthTenantMembershipEntitySchema.init();
    const metadata = AuthTenantMembershipEntitySchema.meta;

    expect(metadata.tableName).toBe("auth_tenant_memberships");
    expect(metadata.properties.tenantId.fieldNames).toContain("tenant_id");
    expect(metadata.properties.userId.fieldNames).toContain("user_id");
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_tenant_memberships__tenant_id_user_id",
        properties: ["tenantId", "userId"],
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_tenant_memberships__tenant_id",
        properties: ["tenantId"],
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_tenant_memberships__user_id",
        properties: ["userId"],
      }),
    );
  });

  it("registers invitation token uniqueness, status check, and lookup indexes", () => {
    AuthTenantInvitationEntitySchema.init();
    const metadata = AuthTenantInvitationEntitySchema.meta;

    expect(metadata.tableName).toBe("auth_tenant_invitations");
    expect(metadata.properties.tenantId.fieldNames).toContain("tenant_id");
    expect(metadata.properties.tokenHash.fieldNames).toContain("token_hash");
    expect(metadata.properties.invitedByUserId.fieldNames).toContain(
      "invited_by_user_id",
    );
    expect(metadata.properties.invitedByUserId.default).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_tenant_invitations__token_hash",
        properties: ["tokenHash"],
      }),
    );
    expect(metadata.checks).toContainEqual(
      expect.objectContaining({
        name: "ck__auth_tenant_invitations__status",
        expression:
          "\"status\" in ('pending', 'accepted', 'revoked', 'expired')",
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_tenant_invitations__tenant_id",
        properties: ["tenantId"],
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_tenant_invitations__email",
        properties: ["email"],
      }),
    );
  });
});
