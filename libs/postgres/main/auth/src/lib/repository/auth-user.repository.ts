import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import { AuthUserEntity, type AuthUserEntityInput } from "../entity";

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

  private async persistUser(
    input: AuthUserEntityInput,
  ): Promise<AuthUserEntity> {
    const entity = new AuthUserEntity(input);
    this.entityManager.persist(entity);
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
