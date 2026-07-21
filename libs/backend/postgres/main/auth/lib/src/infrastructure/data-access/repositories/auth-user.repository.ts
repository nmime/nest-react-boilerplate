import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import type { Locale } from '@app/backend-common-i18n';
import {
  AuthUserEntity,
  DefaultAuthTenantId,
  type AuthUserAvatarStatus,
  type AuthUserThemePreference,
  type AuthUserAccessPolicyInput,
  type AuthUserEntityInput,
} from '../entities';
import { mapAuthUserRepositoryError } from './mapper/auth-user-error.mapper';
import type { AuthUserListInput, AuthUserRepositoryError } from './type/auth-user.type';
import { normalizePageLimit, normalizePageOffset } from './util/pagination.util';

export * from './type/auth-user.type';

@Injectable()
export class AuthUserRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  createUser(input: AuthUserEntityInput): ResultAsync<AuthUserEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.persistUser(input), mapAuthUserRepositoryError);
  }

  findByEmail(
    email: string | null | undefined,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return ResultAsync.fromSafePromise(Promise.resolve(null));
    }

    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthUserEntity, {
        tenantId,
        email: { $ne: null, $eq: normalizedEmail },
      }),
      mapAuthUserRepositoryError,
    );
  }

  findById(
    id: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthUserEntity, { id, tenantId }),
      mapAuthUserRepositoryError,
    );
  }

  listUsers(input: AuthUserListInput = {}): ResultAsync<AuthUserEntity[], AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(AuthUserEntity, this.toUserFilter(input), {
        limit: normalizePageLimit(input.limit),
        offset: normalizePageOffset(input.offset),
        orderBy: { createdAt: 'DESC', id: 'ASC' },
      }),
      mapAuthUserRepositoryError,
    );
  }

  countUsers(input: AuthUserListInput = {}): ResultAsync<number, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AuthUserEntity, this.toUserFilter(input)),
      mapAuthUserRepositoryError,
    );
  }

  setAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyInput,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.updateAccessPolicy(id, policy, tenantId), mapAuthUserRepositoryError);
  }

  setLocale(
    id: string,
    locale: Locale,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return this.setPreferences(id, { locale }, tenantId);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: AuthUserThemePreference },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.updatePreferences(id, preferences, tenantId), mapAuthUserRepositoryError);
  }

  recordLogin(
    id: string,
    loggedInAt: Date = new Date(),
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.updateLastLoginAt(id, loggedInAt, tenantId), mapAuthUserRepositoryError);
  }

  /**
   * Set the user's canonical avatar.
   * If status is "manual", always write (user intent overrides provider).
   * If status is "provider", only write if current status is "none" or "deleted".
   */
  setAvatar(
    id: string,
    input: { url: string; hash: string; status: AuthUserAvatarStatus },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.updateAvatar(id, input, tenantId), mapAuthUserRepositoryError);
  }

  /**
   * Delete the user's canonical avatar, setting status to "deleted".
   */
  deleteAvatar(
    id: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.doDeleteAvatar(id, tenantId), mapAuthUserRepositoryError);
  }

  /**
   * Sync provider avatar to the user profile.
   * Rules:
   * - If avatarStatus is "manual" → do NOT override (user chose their own)
   * - If avatarStatus is "deleted" → do NOT override (user explicitly removed)
   * - If avatarHash matches → skip (no change)
   * - Otherwise → write url, hash, and set status to "provider"
   */
  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.doSyncProviderAvatar(id, input, tenantId), mapAuthUserRepositoryError);
  }

  private async persistUser(input: AuthUserEntityInput): Promise<AuthUserEntity> {
    const entity = new AuthUserEntity({
      ...input,
      email: input.email?.trim().toLowerCase() || null,
      tenantId: input.tenantId ?? DefaultAuthTenantId,
    });
    this.entityManager.persist(entity);
    await this.entityManager.flush();

    return entity;
  }

  private async updateAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyInput,
    tenantId: string,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    if (policy.status) {
      entity.status = policy.status;
    }
    if (policy.roles) {
      entity.roles = policy.roles;
    }
    if (policy.permissions) {
      entity.permissions = policy.permissions;
    }

    await this.entityManager.flush();
    return entity;
  }

  private async updatePreferences(
    id: string,
    preferences: { locale?: Locale; theme?: AuthUserThemePreference },
    tenantId: string,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    if (preferences.locale) {
      entity.locale = preferences.locale;
    }
    if (preferences.theme) {
      entity.theme = preferences.theme;
    }
    await this.entityManager.flush();
    return entity;
  }

  private async updateLastLoginAt(id: string, loggedInAt: Date, tenantId: string): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    entity.lastLoginAt = loggedInAt;
    await this.entityManager.flush();
    return entity;
  }

  private async updateAvatar(
    id: string,
    input: { url: string; hash: string; status: AuthUserAvatarStatus },
    tenantId: string,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    entity.avatarUrl = input.url;
    entity.avatarHash = input.hash;
    entity.avatarStatus = input.status;
    await this.entityManager.flush();
    return entity;
  }

  private async doDeleteAvatar(id: string, tenantId: string): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    entity.avatarUrl = '';
    entity.avatarHash = '';
    entity.avatarStatus = 'deleted';
    await this.entityManager.flush();
    return entity;
  }

  private async doSyncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId: string,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, {
      id,
      tenantId,
    });
    if (!entity) {
      return null;
    }

    // Respect user intent: do not override manual or deleted avatars
    if (entity.avatarStatus === 'manual' || entity.avatarStatus === 'deleted') {
      return entity;
    }

    const avatarUrl = input.url ?? '';
    const avatarHash = input.hash ?? '';

    // Skip if hash is unchanged
    if (entity.avatarHash === avatarHash) {
      return entity;
    }

    entity.avatarUrl = avatarUrl;
    entity.avatarHash = avatarHash;
    entity.avatarStatus = avatarUrl ? 'provider' : 'none';
    await this.entityManager.flush();
    return entity;
  }

  private toUserFilter(input: AuthUserListInput): Record<string, unknown> {
    return {
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      ...(input.search
        ? {
            $or: [
              { email: { $ne: null, $ilike: `%${escapeLike(input.search)}%` } },
              { displayName: { $ilike: `%${escapeLike(input.search)}%` } },
            ],
          }
        : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { roles: { $contains: [input.role] } } : {}),
      ...(input.permission ? { permissions: { $contains: [input.permission] } } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.createdAfter || input.createdBefore
        ? {
            createdAt: {
              ...(input.createdAfter ? { $gte: input.createdAfter } : {}),
              ...(input.createdBefore ? { $lte: input.createdBefore } : {}),
            },
          }
        : {}),
      ...(input.lastLoginAfter || input.lastLoginBefore
        ? {
            lastLoginAt: {
              ...(input.lastLoginAfter ? { $gte: input.lastLoginAfter } : {}),
              ...(input.lastLoginBefore ? { $lte: input.lastLoginBefore } : {}),
            },
          }
        : {}),
    };
  }
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
