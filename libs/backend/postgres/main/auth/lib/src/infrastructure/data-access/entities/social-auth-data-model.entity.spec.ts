import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  AuthLinkTokenEntity,
  AuthLinkTokenEntitySchema,
  AuthProviderTokenEntity,
  AuthProviderTokenEntitySchema,
  ExternalIdentityEntity,
  ExternalIdentityEntitySchema,
  toRedactedAuthProviderTokenView,
} from "./index";

describe("social auth data model entities", () => {
  it("keeps external identity subjects unique per tenant and provider only", () => {
    ExternalIdentityEntitySchema.init();
    const metadata = ExternalIdentityEntitySchema.meta;

    expect(new ExternalIdentityEntity()).toMatchObject({
      email: null,
      emailVerified: null,
      profileMetadata: {},
    });
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_external_identities__tenant_provider_subject",
        properties: ["tenantId", "provider", "providerSubject"],
      }),
    );
    expect(metadata.uniques).not.toContainEqual(
      expect.objectContaining({ properties: ["provider", "providerSubject"] }),
    );
    expect(metadata.properties.email.nullable).toBe(true);
  });

  it("stores link token hashes, expiry, purpose, and consumption state without opaque token columns", () => {
    AuthLinkTokenEntitySchema.init();
    const metadata = AuthLinkTokenEntitySchema.meta;
    const entity = new AuthLinkTokenEntity();

    expect(entity).toMatchObject({
      consumedAt: null,
      deepLinkMetadata: {},
      revokedAt: null,
      userId: null,
    });
    expect(metadata.properties.tokenHash.fieldNames).toContain("token_hash");
    expect(metadata.properties).not.toHaveProperty("token");
    expect(metadata.uniques).toContainEqual(
      expect.objectContaining({
        name: "uq__auth_link_tokens__token_hash",
        properties: ["tokenHash"],
      }),
    );
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_link_tokens__expires_at",
        properties: ["expiresAt"],
      }),
    );
  });

  it("models provider tokens as encrypted redacted records only", () => {
    AuthProviderTokenEntitySchema.init();
    const metadata = AuthProviderTokenEntitySchema.meta;
    const entity = new AuthProviderTokenEntity();
    entity.id = "provider-token-id";
    entity.tenantId = "tenant-id";
    entity.userId = "user-id";
    entity.externalIdentityId = "identity-id";
    entity.provider = "discord";
    entity.tokenKind = "access";
    entity.ciphertext = "ciphertext-value";
    entity.iv = "iv-value";
    entity.authTag = "auth-tag-value";
    entity.keyId = "key-id";
    entity.scopes = ["identify"];

    expect(metadata.properties).not.toHaveProperty("plaintext");
    expect(metadata.properties.ciphertext.type).toBe("text");
    expect(metadata.properties.revokedAt.nullable).toBe(true);
    expect(metadata.indexes).toContainEqual(
      expect.objectContaining({
        name: "ix__auth_provider_tokens__external_identity_id",
        properties: ["externalIdentityId"],
      }),
    );
    expect(
      JSON.stringify(toRedactedAuthProviderTokenView(entity)),
    ).not.toContain("ciphertext-value");
  });
});
