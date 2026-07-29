import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync, okAsync } from 'neverthrow';
import {
  AuthUserRoleRepositoryInjectToken,
  DefaultAuthTenantId,
  permissionsForRoles,
  type AuthUserRoleRepositoryPort,
} from '@app/backend-feature-auth-shared';

export interface AuthRoleStoreError {
  code: 'repository_error';
  message: string;
}

export interface EffectiveAccess {
  roleKeys: string[];
  permissionKeys: string[];
}

export interface AssignRolesInput {
  userId: string;
  tenantId: string;
  roleKeys: readonly string[];
  grantedByUserId?: string | null;
}

/**
 * Abstraction over the normalized RBAC assignment tables. The Postgres
 * implementation delegates to {@link AuthUserRoleRepository}; the in-memory
 * implementation simulates role -> permission resolution using the shared
 * `@app/common-authz` matrix so unit/module specs behave identically without a
 * database.
 */
export interface AuthRoleStore {
  assignRoles(input: AssignRolesInput): ResultAsync<string[], AuthRoleStoreError>;
  listRoleKeys(userId: string, tenantId?: string): ResultAsync<string[], AuthRoleStoreError>;
  resolveEffectiveAccess(userId: string, tenantId?: string): ResultAsync<EffectiveAccess, AuthRoleStoreError>;
}

export const AuthRoleStoreInjectToken = Symbol('AuthRoleStoreInjectToken');

/* v8 ignore start -- Nest decorator metadata is framework glue, not runtime branch logic. */
@Injectable()
export class PostgresAuthRoleStore implements AuthRoleStore {
  constructor(@Inject(AuthUserRoleRepositoryInjectToken) private readonly repository: AuthUserRoleRepositoryPort) {}
  /* v8 ignore stop */

  assignRoles(input: AssignRolesInput): ResultAsync<string[], AuthRoleStoreError> {
    return this.repository.assignRoles({
      userId: input.userId,
      tenantId: input.tenantId,
      roleKeys: input.roleKeys,
      grantedByUserId: input.grantedByUserId,
    });
  }

  listRoleKeys(userId: string, tenantId: string = DefaultAuthTenantId): ResultAsync<string[], AuthRoleStoreError> {
    return this.repository.listRoleKeys(userId, tenantId);
  }

  resolveEffectiveAccess(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<EffectiveAccess, AuthRoleStoreError> {
    return this.repository.resolveEffectiveAccess(userId, tenantId);
  }
}

@Injectable()
export class MongoAuthRoleStore extends PostgresAuthRoleStore {
  constructor(@Inject(AuthUserRoleRepositoryInjectToken) repository: AuthUserRoleRepositoryPort) {
    super(repository);
  }
}

@Injectable()
export class InMemoryAuthRoleStore implements AuthRoleStore {
  private readonly roleKeysByUser = new Map<string, Set<string>>();

  assignRoles(input: AssignRolesInput): ResultAsync<string[], AuthRoleStoreError> {
    const assigned = new Set(input.roleKeys);
    this.roleKeysByUser.set(userKey(input.tenantId, input.userId), assigned);
    return okAsync([...assigned]);
  }

  listRoleKeys(userId: string, tenantId: string = DefaultAuthTenantId): ResultAsync<string[], AuthRoleStoreError> {
    return okAsync(this.rolesFor(tenantId, userId));
  }

  resolveEffectiveAccess(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<EffectiveAccess, AuthRoleStoreError> {
    const roleKeys = this.rolesFor(tenantId, userId);
    return okAsync({
      roleKeys,
      permissionKeys: permissionsForRoles(roleKeys),
    });
  }

  private rolesFor(tenantId: string, userId: string): string[] {
    return [...(this.roleKeysByUser.get(userKey(tenantId, userId)) ?? [])];
  }
}

function userKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}
