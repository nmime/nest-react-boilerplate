import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ResultAsync, okAsync } from "neverthrow";
import type { Locale } from "@app/common/i18n";
import {
  DEFAULT_AUTH_TENANT_ID,
  type UserThemePreference,
} from "@app/backend/feature/auth/shared";
import { AuthUserRepository } from "@app/backend/postgres/main/auth";

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
  status: "active" | "disabled" | "invited";
  lastLoginAt: Date | null;
}

export interface AuthUserStoreError {
  code: "repository_error";
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

export interface AuthUserStore {
  create(
    input: CreateAuthUserInput,
  ): ResultAsync<AuthUserRecord, AuthUserStoreError>;
  findByEmail(
    email: string | null | undefined,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  findById(
    id: string,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setLocale(
    id: string,
    locale: Locale,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  recordLogin(
    id: string,
    loggedInAt?: Date,
    tenantId?: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
}

export const AUTH_USER_STORE = Symbol("AUTH_USER_STORE");

export function toAuthUserRecord(entity: {
  id: string;
  tenantId?: string | null;
  email: string | null;
  displayName: string | null;
  passwordHash: string;
  roles: string[];
  permissions: string[];
  locale: Locale | null;
  theme: UserThemePreference;
  status: "active" | "disabled" | "invited";
  lastLoginAt: Date | null;
}): AuthUserRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId ?? DEFAULT_AUTH_TENANT_ID,
    email: entity.email,
    displayName: entity.displayName,
    passwordHash: entity.passwordHash,
    roles: entity.roles,
    permissions: entity.permissions,
    locale: entity.locale,
    theme: entity.theme,
    status: entity.status,
    lastLoginAt: entity.lastLoginAt,
  };
}

@Injectable()
export class PostgresAuthUserStore implements AuthUserStore {
  constructor(private readonly repository: AuthUserRepository) {}

  create(
    input: CreateAuthUserInput,
  ): ResultAsync<AuthUserRecord, AuthUserStoreError> {
    return this.repository.createUser(input).map(toAuthUserRecord);
  }

  findByEmail(
    email: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .findByEmail(email, tenantId)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  findById(
    id: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .findById(id, tenantId)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  setLocale(
    id: string,
    locale: Locale,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale }, tenantId);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .setPreferences(id, preferences, tenantId)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  recordLogin(
    id: string,
    loggedInAt?: Date,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .recordLogin(id, loggedInAt, tenantId)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }
}

@Injectable()
export class InMemoryAuthUserStore implements AuthUserStore {
  private readonly usersById = new Map<string, AuthUserRecord>();
  private readonly idsByTenantEmail = new Map<string, string>();

  create(
    input: CreateAuthUserInput,
  ): ResultAsync<AuthUserRecord, AuthUserStoreError> {
    const tenantId = input.tenantId ?? DEFAULT_AUTH_TENANT_ID;
    const email = input.email?.trim().toLowerCase() || null;
    const key = email ? tenantEmailKey(tenantId, email) : null;
    if (key && this.idsByTenantEmail.has(key)) {
      return ResultAsync.fromPromise(
        Promise.reject(new Error("Email already exists for tenant.")),
        () => ({
          code: "repository_error" as const,
          message: "Email already exists for tenant.",
        }),
      );
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
      theme: input.theme ?? "system",
      status: "active",
      lastLoginAt: null,
    };
    this.usersById.set(record.id, record);
    if (key) {
      this.idsByTenantEmail.set(key, record.id);
    }
    return okAsync(record);
  }

  findByEmail(
    email: string | null | undefined,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      return okAsync(null);
    }
    const id = this.idsByTenantEmail.get(
      tenantEmailKey(tenantId, normalizedEmail),
    );
    return okAsync(id ? (this.usersById.get(id) ?? null) : null);
  }

  findById(
    id: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id) ?? null;
    return okAsync(record?.tenantId === tenantId ? record : null);
  }

  setLocale(
    id: string,
    locale: Locale,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale }, tenantId);
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
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
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record || record.tenantId !== tenantId) {
      return okAsync(null);
    }
    const updated = { ...record, lastLoginAt: loggedInAt };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }
}

function tenantEmailKey(tenantId: string, email: string): string {
  return `${tenantId}:${email}`;
}
