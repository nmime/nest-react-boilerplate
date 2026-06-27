import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { okAsync, ResultAsync } from "neverthrow";
import { DEFAULT_AUTH_TENANT_ID } from "@app/backend/feature/auth/shared";
import {
  AuthTokenRepository,
  type AuthRefreshTokenEntity,
  type AuthUserTokenEntity,
} from "@app/backend/postgres/main/auth";

export type AuthUserTokenPurpose = "email_verification" | "password_reset";

export interface RefreshTokenIssueInput {
  tenantId: string;
  userId: string;
  ttlSeconds?: number;
  parentTokenId?: string | null;
  familyId?: string;
}

export interface IssuedRefreshToken {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  parentTokenId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

export interface UserActionTokenIssueInput {
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  ttlSeconds?: number;
}

export interface IssuedUserActionToken {
  id: string;
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserActionTokenRecord {
  id: string;
  tenantId: string;
  userId: string;
  purpose: AuthUserTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface AuthTokenStoreError {
  code: "token_store_error";
  message: string;
}

export interface AuthTokenStore {
  issueRefreshToken(
    input: RefreshTokenIssueInput,
  ): ResultAsync<IssuedRefreshToken, AuthTokenStoreError>;
  rotateRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError>;
  revokeRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<boolean, AuthTokenStoreError>;
  findRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError>;
  issueUserActionToken(
    input: UserActionTokenIssueInput,
  ): ResultAsync<IssuedUserActionToken, AuthTokenStoreError>;
  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError>;
}

export const AUTH_TOKEN_STORE = Symbol("AUTH_TOKEN_STORE");

const DefaultRefreshTokenTtlSeconds = 30 * 24 * 60 * 60;
const DefaultEmailVerificationTtlSeconds = 24 * 60 * 60;
const DefaultPasswordResetTtlSeconds = 60 * 60;

@Injectable()
export class PostgresAuthTokenStore implements AuthTokenStore {
  constructor(private readonly repository: AuthTokenRepository) {}

  issueRefreshToken(
    input: RefreshTokenIssueInput,
  ): ResultAsync<IssuedRefreshToken, AuthTokenStoreError> {
    const issued = createIssuedRefreshToken(input);
    return this.repository
      .createRefreshToken({
        id: issued.id,
        tenantId: issued.tenantId,
        userId: issued.userId,
        tokenHash: issued.tokenHash,
        familyId: issued.familyId,
        parentTokenId: input.parentTokenId ?? null,
        expiresAt: issued.expiresAt,
      })
      .map(() => issued)
      .mapErr(mapTokenStoreError);
  }

  rotateRefreshToken(
    token: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError> {
    const nextToken = createOpaqueToken();
    const nextTokenHash = hashOpaqueToken(nextToken);
    const nextId = randomUUID();
    const nextExpiresAt = secondsFromNow(DefaultRefreshTokenTtlSeconds);

    return this.repository
      .rotateRefreshToken({
        tokenHash: hashOpaqueToken(token),
        tenantId,
        replacement: {
          id: nextId,
          tokenHash: nextTokenHash,
          expiresAt: nextExpiresAt,
        },
      })
      .map((entity) =>
        entity
          ? {
              id: entity.id,
              tenantId: entity.tenantId,
              userId: entity.userId,
              token: nextToken,
              tokenHash: entity.tokenHash,
              familyId: entity.familyId,
              expiresAt: entity.expiresAt,
            }
          : null,
      )
      .mapErr(mapTokenStoreError);
  }

  revokeRefreshToken(
    token: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<boolean, AuthTokenStoreError> {
    return this.repository
      .revokeRefreshToken(hashOpaqueToken(token), tenantId)
      .mapErr(mapTokenStoreError);
  }

  findRefreshToken(
    token: string,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError> {
    return this.repository
      .findUsableRefreshToken(hashOpaqueToken(token), tenantId)
      .map((entity) => (entity ? toRefreshTokenRecord(entity) : null))
      .mapErr(mapTokenStoreError);
  }

  issueUserActionToken(
    input: UserActionTokenIssueInput,
  ): ResultAsync<IssuedUserActionToken, AuthTokenStoreError> {
    const issued = createIssuedUserActionToken(input);
    return this.repository
      .createUserToken({
        id: issued.id,
        tenantId: issued.tenantId,
        userId: issued.userId,
        purpose: issued.purpose,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      })
      .map(() => issued)
      .mapErr(mapTokenStoreError);
  }

  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId: string = DEFAULT_AUTH_TENANT_ID,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError> {
    return this.repository
      .consumeUserToken(hashOpaqueToken(token), purpose, tenantId)
      .map((entity) => (entity ? toUserActionTokenRecord(entity) : null))
      .mapErr(mapTokenStoreError);
  }
}

@Injectable()
export class InMemoryAuthTokenStore implements AuthTokenStore {
  private readonly refreshTokensByHash = new Map<string, RefreshTokenRecord>();
  private readonly userTokensByHash = new Map<string, UserActionTokenRecord>();

  issueRefreshToken(
    input: RefreshTokenIssueInput,
  ): ResultAsync<IssuedRefreshToken, AuthTokenStoreError> {
    const issued = createIssuedRefreshToken(input);
    this.refreshTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash: issued.tokenHash,
      familyId: issued.familyId,
      parentTokenId: input.parentTokenId ?? null,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
    });
    return okAsync(issued);
  }

  rotateRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<IssuedRefreshToken | null, AuthTokenStoreError> {
    const record = this.getUsableRefreshToken(token, tenantId);
    if (!record) {
      return okAsync(null);
    }

    const issued = this.createRefreshToken({
      tenantId: record.tenantId,
      userId: record.userId,
      familyId: record.familyId,
      parentTokenId: record.id,
    });
    record.revokedAt = new Date();
    record.replacedByTokenId = issued.id;
    return okAsync(issued);
  }

  revokeRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<boolean, AuthTokenStoreError> {
    const record = this.getUsableRefreshToken(token, tenantId);
    if (!record) {
      return okAsync(false);
    }

    record.revokedAt = new Date();
    return okAsync(true);
  }

  findRefreshToken(
    token: string,
    tenantId?: string,
  ): ResultAsync<RefreshTokenRecord | null, AuthTokenStoreError> {
    return okAsync(this.getUsableRefreshToken(token, tenantId));
  }

  issueUserActionToken(
    input: UserActionTokenIssueInput,
  ): ResultAsync<IssuedUserActionToken, AuthTokenStoreError> {
    const issued = createIssuedUserActionToken(input);
    this.userTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      purpose: issued.purpose,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      consumedAt: null,
    });
    return okAsync(issued);
  }

  consumeUserActionToken(
    token: string,
    purpose: AuthUserTokenPurpose,
    tenantId?: string,
  ): ResultAsync<UserActionTokenRecord | null, AuthTokenStoreError> {
    const tokenHash = hashOpaqueToken(token);
    const record = this.userTokensByHash.get(tokenHash) ?? null;
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt <= new Date() ||
      (tenantId && record.tenantId !== tenantId)
    ) {
      return okAsync(null);
    }

    record.consumedAt = new Date();
    return okAsync(record);
  }

  private createRefreshToken(
    input: RefreshTokenIssueInput,
  ): IssuedRefreshToken {
    const issued = createIssuedRefreshToken(input);
    this.refreshTokensByHash.set(issued.tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash: issued.tokenHash,
      familyId: issued.familyId,
      parentTokenId: input.parentTokenId ?? null,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
    });
    return issued;
  }

  private getUsableRefreshToken(
    token: string,
    tenantId?: string,
  ): RefreshTokenRecord | null {
    const tokenHash = hashOpaqueToken(token);
    const record = this.refreshTokensByHash.get(tokenHash) ?? null;
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      (tenantId && record.tenantId !== tenantId)
    ) {
      return null;
    }

    return record;
  }
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createIssuedRefreshToken(
  input: RefreshTokenIssueInput,
): IssuedRefreshToken {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  return {
    id: randomUUID(),
    tenantId: input.tenantId || DEFAULT_AUTH_TENANT_ID,
    userId: input.userId,
    token,
    tokenHash,
    familyId: input.familyId ?? randomUUID(),
    expiresAt: secondsFromNow(
      input.ttlSeconds ?? DefaultRefreshTokenTtlSeconds,
    ),
  };
}

function createIssuedUserActionToken(
  input: UserActionTokenIssueInput,
): IssuedUserActionToken {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  return {
    id: randomUUID(),
    tenantId: input.tenantId || DEFAULT_AUTH_TENANT_ID,
    userId: input.userId,
    purpose: input.purpose,
    token,
    tokenHash,
    expiresAt: secondsFromNow(
      input.ttlSeconds ?? defaultUserActionTokenTtl(input.purpose),
    ),
  };
}

function toRefreshTokenRecord(
  entity: AuthRefreshTokenEntity,
): RefreshTokenRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    tokenHash: entity.tokenHash,
    familyId: entity.familyId,
    parentTokenId: entity.parentTokenId,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
    replacedByTokenId: entity.replacedByTokenId,
  };
}

function toUserActionTokenRecord(
  entity: AuthUserTokenEntity,
): UserActionTokenRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    purpose: entity.purpose,
    tokenHash: entity.tokenHash,
    expiresAt: entity.expiresAt,
    consumedAt: entity.consumedAt,
  };
}

function mapTokenStoreError(cause: { message?: string }): AuthTokenStoreError {
  return {
    code: "token_store_error",
    message: cause.message ?? "Auth token store failed.",
  };
}

function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function defaultUserActionTokenTtl(purpose: AuthUserTokenPurpose): number {
  return purpose === "email_verification"
    ? DefaultEmailVerificationTtlSeconds
    : DefaultPasswordResetTtlSeconds;
}
