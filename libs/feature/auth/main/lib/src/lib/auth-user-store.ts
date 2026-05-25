import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ResultAsync, okAsync } from "neverthrow";
import type { Locale } from "@app/common/i18n";
import type { UserThemePreference } from "@app/feature-auth-shared";
import { AuthUserRepository } from "@app/postgres-main-auth";

export interface AuthUserRecord {
  id: string;
  email: string;
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
  email: string;
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
    email: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  findById(id: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setLocale(
    id: string,
    locale: Locale,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
  recordLogin(
    id: string,
    loggedInAt?: Date,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError>;
}

export const AUTH_USER_STORE = Symbol("AUTH_USER_STORE");

export function toAuthUserRecord(entity: {
  id: string;
  email: string;
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
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .findByEmail(email)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  findById(id: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .findById(id)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  setLocale(
    id: string,
    locale: Locale,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale });
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .setPreferences(id, preferences)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }

  recordLogin(
    id: string,
    loggedInAt?: Date,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.repository
      .recordLogin(id, loggedInAt)
      .map((entity) => (entity ? toAuthUserRecord(entity) : null));
  }
}

@Injectable()
export class InMemoryAuthUserStore implements AuthUserStore {
  private readonly usersById = new Map<string, AuthUserRecord>();
  private readonly idsByEmail = new Map<string, string>();

  create(
    input: CreateAuthUserInput,
  ): ResultAsync<AuthUserRecord, AuthUserStoreError> {
    const email = input.email.toLowerCase();
    if (this.idsByEmail.has(email)) {
      return ResultAsync.fromPromise(
        Promise.reject(new Error("Email already exists.")),
        () => ({
          code: "repository_error" as const,
          message: "Email already exists.",
        }),
      );
    }

    const record: AuthUserRecord = {
      id: randomUUID(),
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
    this.idsByEmail.set(email, record.id);
    return okAsync(record);
  }

  findByEmail(
    email: string,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const id = this.idsByEmail.get(email.toLowerCase());
    return okAsync(id ? (this.usersById.get(id) ?? null) : null);
  }

  findById(id: string): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return okAsync(this.usersById.get(id) ?? null);
  }

  setLocale(
    id: string,
    locale: Locale,
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    return this.setPreferences(id, { locale });
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: UserThemePreference },
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record) {
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
  ): ResultAsync<AuthUserRecord | null, AuthUserStoreError> {
    const record = this.usersById.get(id);
    if (!record) {
      return okAsync(null);
    }
    const updated = { ...record, lastLoginAt: loggedInAt };
    this.usersById.set(id, updated);
    return okAsync(updated);
  }
}
