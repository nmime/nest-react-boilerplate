import { EntityManager, raw } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import type { Locale } from '@app/backend-common-i18n';
import { permissionCatalog, roleKeys } from '@app/common-authz';
import {
  AuthUserEntity,
  DefaultAuthTenantId,
  type AuthUserAvatarStatus,
  type AuthUserThemePreference,
  type AuthUserEntityInput,
} from '../entities';
import { mapAuthUserRepositoryError } from './mapper/auth-user-error.mapper';
import type { AuthUserListInput, AuthUserRepositoryError } from './type/auth-user.type';
import { resolveEffectiveAccessSql } from './const/auth-user-role.sql';
import type { EffectiveAccessRow } from './type/auth-user-role-internal.type';
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
      this.findOneWithAccess({ tenantId, email: { $ne: null, $eq: normalizedEmail } }),
      mapAuthUserRepositoryError,
    );
  }

  findById(
    id: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.findOneWithAccess({ id, tenantId }), mapAuthUserRepositoryError);
  }

  listUsers(input: AuthUserListInput = {}): ResultAsync<AuthUserEntity[], AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.findUsersWithAccess(input), mapAuthUserRepositoryError);
  }

  countUsers(input: AuthUserListInput = {}): ResultAsync<number, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.count(AuthUserEntity, this.toUserFilter(input)),
      mapAuthUserRepositoryError,
    );
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
      // Grants are only established through normalized RBAC repositories.
      permissions: [],
      roles: [],
    });
    this.entityManager.persist(entity);
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
    return this.hydrateAccess(entity);
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
    return this.hydrateAccess(entity);
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
    return this.hydrateAccess(entity);
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
    return this.hydrateAccess(entity);
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
    return this.hydrateAccess(entity);
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
      ...(input.role
        ? {
            [raw(
              (alias) =>
                `exists (select 1 from "auth_user_roles" ur inner join "auth_roles" r on r."id" = ur."role_id" and r."tenant_id" = ur."tenant_id" where ur."auth_user_id" = ${alias}."id" and ur."tenant_id" = ${alias}."tenant_id" and r."key" = ?)`,
              [input.role],
            )]: [],
          }
        : {}),
      ...(input.permission
        ? {
            [raw(
              (alias) =>
                `exists (select 1 from "auth_user_permissions" up inner join "auth_permissions" p on p."id" = up."permission_id" where up."auth_user_id" = ${alias}."id" and up."tenant_id" = ${alias}."tenant_id" and p."key" = ? union all select 1 from "auth_user_roles" ur inner join "auth_role_permissions" rp on rp."role_id" = ur."role_id" inner join "auth_permissions" p on p."id" = rp."permission_id" where ur."auth_user_id" = ${alias}."id" and ur."tenant_id" = ${alias}."tenant_id" and p."key" = ?)`,
              [input.permission, input.permission],
            )]: [],
          }
        : {}),
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

  private async findOneWithAccess(where: Record<string, unknown>): Promise<AuthUserEntity | null> {
    // Background callers (e.g. the notification delivery scheduler) have no
    // MikroORM request context, so the read runs in its own transaction instead
    // of on the global EntityManager. HTTP callers with an active context nest fine.
    const entity = await this.entityManager.transactional((em) => em.findOne(AuthUserEntity, where));
    return entity ? this.hydrateAccess(entity) : null;
  }

  private async findUsersWithAccess(input: AuthUserListInput): Promise<AuthUserEntity[]> {
    const entities = await this.entityManager.find(AuthUserEntity, this.toUserFilter(input), {
      limit: normalizePageLimit(input.limit),
      offset: normalizePageOffset(input.offset),
      orderBy: { createdAt: 'DESC', id: 'ASC' },
    });
    await Promise.all(entities.map((entity) => this.hydrateAccess(entity)));
    return entities;
  }

  private async hydrateAccess(entity: AuthUserEntity): Promise<AuthUserEntity> {
    const rows = (await this.entityManager
      .getConnection()
      .execute(
        resolveEffectiveAccessSql,
        [entity.id, entity.tenantId, entity.id, entity.tenantId],
        'all',
      )) as EffectiveAccessRow[];
    entity.roles = orderByCatalog(
      rows.map((row) => row.role_key),
      roleOrder,
    );
    entity.permissions = orderByCatalog(
      rows.map((row) => row.permission_key),
      permissionOrder,
    );
    return entity;
  }
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

const roleOrder = new Map<string, number>(roleKeys.map((key, index) => [key, index]));
const permissionOrder = new Map<string, number>(permissionCatalog.map((permission, index) => [permission.key, index]));

function orderByCatalog(values: Array<string | null>, order: ReadonlyMap<string, number>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => {
    const leftIndex = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex === rightIndex ? left.localeCompare(right) : leftIndex - rightIndex;
  });
}
