import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import type { Locale } from "@app/common/i18n";
import {
  AuthUserEntity,
  type AuthUserThemePreference,
  type AuthUserAccessPolicyInput,
  type AuthUserEntityInput,
} from "../entity";

export interface AuthUserRepositoryError {
  code: "repository_error";
  message: string;
}

@Injectable()
export class AuthUserRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  createUser(
    input: AuthUserEntityInput,
  ): ResultAsync<AuthUserEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(this.persistUser(input), mapRepositoryError);
  }

  findByEmail(
    email: string,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthUserEntity, { email }),
      mapRepositoryError,
    );
  }

  findById(
    id: string,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthUserEntity, { id }),
      mapRepositoryError,
    );
  }

  setAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyInput,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.updateAccessPolicy(id, policy),
      mapRepositoryError,
    );
  }

  setLocale(
    id: string,
    locale: Locale,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return this.setPreferences(id, { locale });
  }

  setPreferences(
    id: string,
    preferences: { locale?: Locale; theme?: AuthUserThemePreference },
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.updatePreferences(id, preferences),
      mapRepositoryError,
    );
  }

  recordLogin(
    id: string,
    loggedInAt: Date = new Date(),
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.updateLastLoginAt(id, loggedInAt),
      mapRepositoryError,
    );
  }

  private async persistUser(
    input: AuthUserEntityInput,
  ): Promise<AuthUserEntity> {
    const entity = new AuthUserEntity(input);
    this.entityManager.persist(entity);
    await this.entityManager.flush();

    return entity;
  }

  private async updateAccessPolicy(
    id: string,
    policy: AuthUserAccessPolicyInput,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, { id });
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
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, { id });
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

  private async updateLastLoginAt(
    id: string,
    loggedInAt: Date,
  ): Promise<AuthUserEntity | null> {
    const entity = await this.entityManager.findOne(AuthUserEntity, { id });
    if (!entity) {
      return null;
    }

    entity.lastLoginAt = loggedInAt;
    await this.entityManager.flush();
    return entity;
  }
}

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: "repository_error",
    message:
      cause instanceof Error ? cause.message : "Auth user repository failed.",
  };
}
