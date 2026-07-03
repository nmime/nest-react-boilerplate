import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AuthProviderTokenEntity,
  DefaultAuthTenantId,
  toRedactedAuthProviderTokenView,
  type AuthProviderTokenKind,
  type ExternalAuthProvider,
  type RedactedAuthProviderTokenView,
} from "../entities";
import type { ProviderTokenCiphertext } from "../../../provider-token-crypto.service";
import {
  mapSocialAuthError,
  type SocialAuthRepositoryError,
} from "./external-identity.repository";

export interface PersistAuthProviderTokenInput extends ProviderTokenCiphertext {
  tenantId?: string;
  userId: string;
  externalIdentityId: string;
  provider?: ExternalAuthProvider;
  tokenKind: AuthProviderTokenKind;
  scopes?: string[];
  expiresAt?: Date | null;
}

@Injectable()
export class AuthProviderTokenRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  persistEncryptedToken(
    input: PersistAuthProviderTokenInput,
  ): ResultAsync<AuthProviderTokenEntity, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistToken(input),
      mapSocialAuthError,
    );
  }

  listRedactedByExternalIdentity(
    externalIdentityId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<RedactedAuthProviderTokenView[], SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager
        .find(
          AuthProviderTokenEntity,
          { tenantId, externalIdentityId },
          { orderBy: { createdAt: "DESC" } },
        )
        .then((tokens) => tokens.map(toRedactedAuthProviderTokenView)),
      mapSocialAuthError,
    );
  }

  revokeToken(
    id: string,
    tenantId: string = DefaultAuthTenantId,
    revokedAt: Date = new Date(),
  ): ResultAsync<AuthProviderTokenEntity | null, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.revokePersistedToken(id, tenantId, revokedAt),
      mapSocialAuthError,
    );
  }

  private async persistToken(
    input: PersistAuthProviderTokenInput,
  ): Promise<AuthProviderTokenEntity> {
    const entity = new AuthProviderTokenEntity();
    entity.tenantId = input.tenantId ?? DefaultAuthTenantId;
    entity.userId = input.userId;
    entity.externalIdentityId = input.externalIdentityId;
    entity.provider = input.provider ?? "discord";
    entity.tokenKind = input.tokenKind;
    entity.ciphertext = input.ciphertext;
    entity.iv = input.iv;
    entity.authTag = input.authTag;
    entity.keyId = input.keyId;
    entity.scopes = input.scopes ?? [];
    entity.expiresAt = input.expiresAt ?? null;

    this.entityManager.persist(entity);
    await this.entityManager.flush();
    return entity;
  }

  private async revokePersistedToken(
    id: string,
    tenantId: string,
    revokedAt: Date,
  ): Promise<AuthProviderTokenEntity | null> {
    const entity = await this.entityManager.findOne(AuthProviderTokenEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    entity.revokedAt = revokedAt;
    await this.entityManager.flush();
    return entity;
  }
}
