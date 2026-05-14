import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ResultAsync } from "neverthrow";
import type { Repository } from "typeorm";
import { AuthUserEntity, type AuthUserEntityInput } from "../entity";

export interface AuthUserRepositoryError {
  code: "repository_error";
  message: string;
}

@Injectable()
export class AuthUserRepository {
  constructor(
    @InjectRepository(AuthUserEntity)
    private readonly repository: Repository<AuthUserEntity>,
  ) {}

  createUser(
    input: AuthUserEntityInput,
  ): ResultAsync<AuthUserEntity, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.repository.save(this.repository.create(input)),
      mapRepositoryError,
    );
  }

  findByEmail(
    email: string,
  ): ResultAsync<AuthUserEntity | null, AuthUserRepositoryError> {
    return ResultAsync.fromPromise(
      this.repository.findOne({ where: { email } }),
      mapRepositoryError,
    );
  }
}

function mapRepositoryError(cause: unknown): AuthUserRepositoryError {
  return {
    code: "repository_error",
    message:
      cause instanceof Error ? cause.message : "Auth user repository failed.",
  };
}
