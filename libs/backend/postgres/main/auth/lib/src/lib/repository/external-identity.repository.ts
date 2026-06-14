import { EntityManager, LockMode } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  DefaultAuthTenantId,
  ExternalIdentityEntity,
  type ExternalAuthProvider,
  type ExternalAuthProviderChannel,
} from "../entity";

export interface SocialAuthRepositoryError {
  code: "repository_error";
  message: string;
}

export interface UpsertExternalIdentityInput {
  tenantId?: string;
  userId: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  profileMetadata?: Record<string, unknown>;
  email?: string | null;
  emailVerified?: boolean | null;
  locale?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
  lastAuthenticatedAt?: Date | null;
  linkedAt?: Date;
}

@Injectable()
export class ExternalIdentityRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  upsertIdentity(
    input: UpsertExternalIdentityInput,
  ): ResultAsync<ExternalIdentityEntity, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistIdentity(input),
      mapSocialAuthError,
    );
  }

  findByProviderSubject(
    provider: ExternalAuthProvider,
    providerSubject: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<ExternalIdentityEntity | null, SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(ExternalIdentityEntity, {
        tenantId,
        provider,
        providerSubject,
      }),
      mapSocialAuthError,
    );
  }

  findByUser(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<ExternalIdentityEntity[], SocialAuthRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(
        ExternalIdentityEntity,
        { tenantId, userId },
        { orderBy: { linkedAt: "ASC" } },
      ),
      mapSocialAuthError,
    );
  }

  private async persistIdentity(
    input: UpsertExternalIdentityInput,
  ): Promise<ExternalIdentityEntity> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;

    return this.entityManager.transactional(async (em) => {
      const existing = await em.findOne(
        ExternalIdentityEntity,
        {
          tenantId,
          provider: input.provider,
          providerSubject: input.providerSubject,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const entity = existing ?? new ExternalIdentityEntity();
      entity.tenantId = tenantId;
      entity.userId = input.userId;
      entity.provider = input.provider;
      entity.providerSubject = input.providerSubject;
      entity.channel = input.channel;
      entity.profileMetadata = input.profileMetadata ?? entity.profileMetadata;
      entity.email = normalizeOptionalText(input.email);
      entity.emailVerified = input.emailVerified ?? null;
      entity.locale = normalizeOptionalText(input.locale);
      entity.avatarUrl = normalizeOptionalText(input.avatarUrl);
      entity.displayName = normalizeOptionalText(input.displayName);
      entity.username = normalizeOptionalText(input.username);
      entity.lastAuthenticatedAt = input.lastAuthenticatedAt ?? new Date();
      entity.linkedAt = input.linkedAt ?? entity.linkedAt ?? new Date();

      if (!existing) {
        em.persist(entity);
      }
      await em.flush();
      return entity;
    });
  }
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function mapSocialAuthError(cause: unknown): SocialAuthRepositoryError {
  return {
    code: "repository_error",
    message:
      cause instanceof Error ? cause.message : "Social auth repository failed.",
  };
}
