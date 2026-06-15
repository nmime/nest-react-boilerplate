import type { EntityManager } from "@mikro-orm/postgresql";
import { LockMode } from "@mikro-orm/core";
import { describe, expect, it, vi } from "vitest";
import {
  AuthLinkTokenEntity,
  AuthMethodEntity,
  AuthProviderTokenEntity,
  ExternalIdentityEntity,
  toRedactedAuthProviderTokenView,
} from "../entity";
import { AuthLinkTokenRepository } from "./auth-link-token.repository";
import { AuthMethodRepository } from "./auth-method.repository";
import { AuthProviderTokenRepository } from "./auth-provider-token.repository";
import { ExternalIdentityRepository } from "./external-identity.repository";

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve(null));
  const find = vi.fn(() => Promise.resolve([]));
  const count = vi.fn(() => Promise.resolve(0));
  const transactional = vi.fn((callback: (em: EntityManager) => unknown) =>
    Promise.resolve(callback(entityManager)),
  );
  const entityManager = {
    persist,
    flush,
    findOne,
    find,
    count,
    transactional,
  } as unknown as EntityManager;

  return { persist, flush, findOne, find, count, transactional, entityManager };
}

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-06-14T12:00:00.000Z");
const expiresAt = new Date("2026-06-14T12:10:00.000Z");

describe("social auth repositories", () => {
  it("upserts external identities by tenant provider subject", async () => {
    const { findOne, persist, flush, entityManager } =
      createEntityManagerMock();
    const repository = new ExternalIdentityRepository(entityManager);

    const result = await repository.upsertIdentity({
      tenantId,
      userId,
      provider: "telegram",
      providerSubject: "tg-123",
      channel: "telegram_tma",
      profileMetadata: { firstName: "Ada" },
      email: null,
      username: "ada",
      lastAuthenticatedAt: now,
    });

    const entity = result._unsafeUnwrap();
    expect(findOne).toHaveBeenCalledWith(
      ExternalIdentityEntity,
      { tenantId, provider: "telegram", providerSubject: "tg-123" },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(entity).toMatchObject({
      tenantId,
      userId,
      provider: "telegram",
      providerSubject: "tg-123",
      channel: "telegram_tma",
      profileMetadata: { firstName: "Ada" },
      email: null,
      username: "ada",
      lastAuthenticatedAt: now,
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("maps external identity unique conflicts to repository errors", async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue(
      new Error("duplicate key value violates unique constraint"),
    );
    const repository = new ExternalIdentityRepository(entityManager);

    const result = await repository.findByProviderSubject(
      "discord",
      "discord-123",
      tenantId,
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "repository_error",
      message: "duplicate key value violates unique constraint",
    });
  });

  it("consumes link tokens once and excludes expired or revoked tokens", async () => {
    const { findOne, flush, entityManager } = createEntityManagerMock();
    const token = new AuthLinkTokenEntity();
    findOne.mockResolvedValueOnce(token).mockResolvedValueOnce(null);
    const repository = new AuthLinkTokenRepository(entityManager);

    const consumed = await repository.consumeToken(
      "hashed-link-token",
      "login",
      tenantId,
      now,
    );
    const consumedAgain = await repository.consumeToken(
      "hashed-link-token",
      "login",
      tenantId,
      now,
    );

    expect(consumed._unsafeUnwrap()).toBe(token);
    expect(consumedAgain._unsafeUnwrap()).toBeNull();
    expect(token.consumedAt).toBe(now);
    expect(findOne).toHaveBeenCalledWith(
      AuthLinkTokenEntity,
      {
        tokenHash: "hashed-link-token",
        purpose: "login",
        tenantId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("revokes only usable unconsumed link tokens", async () => {
    const { findOne, flush, entityManager } = createEntityManagerMock();
    const token = new AuthLinkTokenEntity();
    findOne.mockResolvedValue(token);
    const repository = new AuthLinkTokenRepository(entityManager);

    const revoked = await repository.revokeToken(
      "hashed-link-token",
      tenantId,
      now,
    );

    expect(revoked._unsafeUnwrap()).toBe(true);
    expect(token.revokedAt).toBe(now);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("persists hashed link tokens with nullable users and never needs opaque token input", async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const repository = new AuthLinkTokenRepository(entityManager);

    const created = await repository.createToken({
      deepLinkMetadata: { returnUrl: "https://app.example.test/link" },
      expiresAt,
      provider: "discord",
      purpose: "login",
      tokenHash: "sha256-link-token-hash",
    });

    const entity = created._unsafeUnwrap();
    expect(entity).toMatchObject({
      deepLinkMetadata: { returnUrl: "https://app.example.test/link" },
      provider: "discord",
      purpose: "login",
      tokenHash: "sha256-link-token-hash",
      userId: null,
    });
    expect(entity).not.toHaveProperty("token");
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("supports last auth method policy queries", async () => {
    const method = new AuthMethodEntity();
    method.method = "discord_oauth";
    method.lastUsedAt = now;
    const { findOne, count, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(method);
    count.mockResolvedValue(2);
    const repository = new AuthMethodRepository(entityManager);

    const lastMethod = await repository.findLastUsedByUser(userId, tenantId);
    const usableCount = await repository.countUsableMethodsForUser(
      userId,
      tenantId,
    );

    expect(lastMethod._unsafeUnwrap()).toBe(method);
    expect(usableCount._unsafeUnwrap()).toBe(2);
    expect(findOne).toHaveBeenCalledWith(
      AuthMethodEntity,
      { tenantId, userId, lastUsedAt: { $ne: null } },
      { orderBy: { lastUsedAt: "DESC" } },
    );
    expect(count).toHaveBeenCalledWith(AuthMethodEntity, { tenantId, userId });
  });

  it("persists provider token ciphertext and redacts plaintext from loggable views", async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const repository = new AuthProviderTokenRepository(entityManager);

    const created = await repository.persistEncryptedToken({
      tenantId,
      userId,
      externalIdentityId: "33333333-3333-4333-8333-333333333333",
      provider: "discord",
      tokenKind: "access",
      ciphertext: "ciphertext-base64",
      iv: "iv-base64",
      authTag: "tag-base64",
      keyId: "key-2026-06",
      scopes: ["identify", "email"],
      expiresAt,
    });

    const entity = created._unsafeUnwrap();
    expect(entity).toMatchObject({
      ciphertext: "ciphertext-base64",
      iv: "iv-base64",
      authTag: "tag-base64",
      keyId: "key-2026-06",
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);

    const redacted = toRedactedAuthProviderTokenView(entity);
    expect(redacted).toMatchObject({ redacted: true, keyId: "key-2026-06" });
    expect(JSON.stringify(redacted)).not.toContain("ciphertext-base64");
    expect(JSON.stringify(redacted)).not.toContain("iv-base64");
    expect(JSON.stringify(redacted)).not.toContain("tag-base64");
  });

  it("lists redacted provider tokens by external identity and tenant without ciphertext fields", async () => {
    const token = new AuthProviderTokenEntity();
    token.id = "provider-token-id";
    token.tenantId = tenantId;
    token.userId = userId;
    token.externalIdentityId = "33333333-3333-4333-8333-333333333333";
    token.provider = "discord";
    token.tokenKind = "refresh";
    token.ciphertext = "ciphertext-value";
    token.iv = "iv-value";
    token.authTag = "auth-tag-value";
    token.keyId = "key-id";
    token.revokedAt = now;
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([token]);
    const repository = new AuthProviderTokenRepository(entityManager);

    const listed = await repository.listRedactedByExternalIdentity(
      token.externalIdentityId,
      tenantId,
    );

    expect(find).toHaveBeenCalledWith(
      AuthProviderTokenEntity,
      { tenantId, externalIdentityId: token.externalIdentityId },
      { orderBy: { createdAt: "DESC" } },
    );
    expect(listed._unsafeUnwrap()).toEqual([
      expect.objectContaining({
        id: "provider-token-id",
        keyId: "key-id",
        redacted: true,
        revokedAt: now,
        tokenKind: "refresh",
      }),
    ]);
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain(
      "ciphertext-value",
    );
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain("iv-value");
    expect(JSON.stringify(listed._unsafeUnwrap())).not.toContain(
      "auth-tag-value",
    );
  });

  it("revokes provider tokens by id and tenant while returning null for tenant mismatches", async () => {
    const token = new AuthProviderTokenEntity();
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(token);
    const repository = new AuthProviderTokenRepository(entityManager);

    const missing = await repository.revokeToken(
      "provider-token-id",
      "33333333-3333-4333-8333-333333333333",
      now,
    );
    const revoked = await repository.revokeToken(
      "provider-token-id",
      tenantId,
      now,
    );

    expect(missing._unsafeUnwrap()).toBeNull();
    expect(revoked._unsafeUnwrap()).toBe(token);
    expect(token.revokedAt).toBe(now);
    expect(findOne).toHaveBeenNthCalledWith(1, AuthProviderTokenEntity, {
      id: "provider-token-id",
      tenantId: "33333333-3333-4333-8333-333333333333",
    });
    expect(findOne).toHaveBeenNthCalledWith(2, AuthProviderTokenEntity, {
      id: "provider-token-id",
      tenantId,
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
