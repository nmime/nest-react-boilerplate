import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ResultAsync, okAsync } from 'neverthrow';
import type { Locale } from '@app/backend-common-i18n';
import {
  AuthenticatedTheme,
  DefaultAuthTenantId,
  normalizeUserThemePreference,
  type UserThemePreference,
} from '@app/backend-feature-auth-shared';
import { AuthUserRepository, type AuthUserEntity } from '@app/backend-postgres-main-auth';

export interface AuthUserRecord {
  id: string;
  tenantId: string;
  email: string | null;
  displayName: string | null;
  passwordHash: string;
  roles: string[];
  permissions: string[];
  locale: Locale | null;
  theme: UserThemePreference;
  status: 'active' | 'disabled' | 'invited';
  lastLoginAt: Date | null;
  avatarUrl: string | null;
  avatarHash: string | null;
  avatarStatus: 'none' | 'provider' | 'manual' | 'deleted';
}

export interface AuthUserStoreError {
  code: 'repository_error';
  message: string;
}

export interface CreateAuthUserInput {
  tenantId?: string;
  email: string | null;
  displayName?: string | null;
  passwordHash: string;
  roles: string[];
  permissions: string[];
  locale?: Locale | null;
  theme?: UserThemePreference | null;
}

export interface AuthUserAccessPolicyUpdate {
  roles?: string[];
  permissions?: string[];
  status?: AuthUserRecord['status'];
}

export interface AuthUserStore {
  create(input: CreateAuthUserInput): ResultAsync<AuthUserRecord, AuthUserStoreError>;
  setAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyUpdate,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  findByEmail(
    email: string | null | undefined,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  findById(id: string, tenantId?: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setLocale(id: string, locale: Locale, tenantId?: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  recordLogin(id: string, loggedInAt?: Date, tenantId?: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
}

export const AuthUserStoreInjectToken = Symbol('AuthUserStoreInjectToken');

export function toAuthUserRecord(entity: {
  id: string;
  tenantId?: string | null;
  email: string | null;
  displayName: string | null;
  passwordHash: string;
  roles: string[];
  permissions: string[];
  locale: Locale | null;
  theme: string | null;
  status: 'active' | 'disabled' | 'invited';
  lastLoginAt: Date | null;
  avatarUrl?: string | null;
  avatarHash?: string | null;
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
}): AuthUserRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId ?? DefaultAuthTenantId,
    email: entity.email,
    displayName: entity.displayName,
    passwordHash: entity.passwordHash,
    roles: entity.roles,
    permissions: entity.permissions,
    locale: entity.locale,
    theme: normalizeUserThemePreference(entity.theme) ?? AuthenticatedTheme.System,
    status: entity.status,
    lastLoginAt: entity.lastLoginAt,
    avatarUrl: entity.avatarUrl || null,
    avatarHash: entity.avatarHash || null,
    avatarStatus: entity.avatarStatus ?? 'none',
  };
}

/* v8 ignore start -- Nest decorator metadata is framework glue, not runtime branch logic. */
@Injectable()
export class PostgresAuthUserStore implements AuthUserStore {
  constructor(private readonly repository: AuthUserRepository) {}
  /* v8 ignore stop */

  create(input: CreateAuthUserInput): ResultAsync<AuthUserRecord, AuthUserStoreError> {
    return this.repository.createUser(input).map(toAuthUserRecord);
  }

  setAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyUpdate,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .setAccessPolicy(id, policy, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }

  findByEmail(
    email: string | null | undefined,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    if (!email) {
      return okAsync(null);
    }

    return this.repository
      .findByEmail(email, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }

  findById(id: string, tenantId: string = DefaultAuthTenantId): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .findById(id, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }

  setLocale(
    id: string,
    locale: Locale,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale }, tenantId);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .setPreferences(id, preferences, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }

  recordLogin(
    id: string,
    loggedInAt?: Date,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .recordLogin(id, loggedInAt, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }

  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .syncProviderAvatar(id, input, tenantId)
      .map((entity: AuthUserEntity | null) => (entity ? toAuthUserRecord(entity) : null));
  }
}

@Injectable()
export class InMemoryAuthUserStore implements AuthUserStore {
  private readonly usersById = new Map<string, AuthUserRecord>();
  private readonly idsByTenantEmail = new Map<string, string>();

  create(input: CreateAuthUserInput): ResultAsync<AuthUserRecord, AuthUserStoreError> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const email = input.email?.trim().toLowerCase() || null;
    const key = email ? tenantEmailKey(tenantId, email) : null;
    if (key && this.idsByTenantEmail.has(key)) {
      return ResultAsync.fromPromise(Promise.reject(new Error('Email already exists for tenant.')), () => ({
        code: 'repository_error' as const,
        message: 'Email already exists for tenant.',
      }));
    }

    const record: AuthUserRecord = {
      id: randomUUID(),
      tenantId,
      email,
      displayName: input.displayName ?? null,
      passwordHash: input.passwordHash,
      roles: input.roles,
      permissions: input.permissions,
      locale: input.locale ?? null,
      theme: input.theme ?? AuthenticatedTheme.System,
      status: 'active',
      lastLoginAt: null,
      avatarUrl: null,
      avatarHash: null,
      avatarStatus: 'none',
    };
    this.usersById.set(record.id, record);
    if (key) {
      this.idsByTenantEmail.set(key, record.id);
    }
    return okAsync(record);
  }

  setAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyUpdate,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record || record.tenantId !== tenantId) {
      return okAsync(null);
    }
    const updated: AuthUserRecord = {
      ...record,
      ...(policy.roles ? { roles: [...policy.roles] } : {}),
      ...(policy.permissions ? { permissions: [...policy.permissions] } : {}),
      ...(policy.status ? { status: policy.status } : {}),
    };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }

  findByEmail(
    email: string | null | undefined,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return okAsync(null);
    }
    const id = this.idsByTenantEmail.get(tenantEmailKey(tenantId, normalizedEmail));
    return okAsync(id ? (this.usersById.get(id) ?? null) : null);
  }

  findById(id: string, tenantId: string = DefaultAuthTenantId): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id) ?? null;
    return okAsync(record?.tenantId === tenantId ? record : null);
  }

  setLocale(
    id: string,
    locale: Locale,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale }, tenantId);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record || record.tenantId !== tenantId) {
      return okAsync(null);
    }
    const updated = {
      ...record,
      ...(preferences.locale ? { locale: preferences.locale } : {}),
      ...(preferences.theme ? { theme: preferences.theme } : {}),
    };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }

  recordLogin(
    id: string,
    loggedInAt: Date = new Date(),
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record || record.tenantId !== tenantId) {
      return okAsync(null);
    }
    const updated = { ...record, lastLoginAt: loggedInAt };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }

  syncProviderAvatar(
    id: string,
    input: { url: string | null; hash: string | null },
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record || record.tenantId !== tenantId) {
      return okAsync(null);
    }

    // Respect user intent: do not override manual or deleted avatars
    if (record.avatarStatus === 'manual' || record.avatarStatus === 'deleted') {
      return okAsync(record);
    }

    // Skip if hash is unchanged
    if (record.avatarHash === input.hash) {
      return okAsync(record);
    }

    const updated: AuthUserRecord = {
      ...record,
      avatarUrl: input.url,
      avatarHash: input.hash,
      avatarStatus: input.url ? 'provider' : 'none',
    };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }
}

function tenantEmailKey(tenantId: string, email: string): string {
  return `${tenantId}:${email}`;
}
