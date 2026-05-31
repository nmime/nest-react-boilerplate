import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { okAsync, ResultAsync } from "neverthrow";
import { DEFAULT_AUTH_TENANT_ID } from "@app/feature-auth-shared";

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
export class InMemoryAuthTokenStore implements AuthTokenStore {
  private readonly refreshTokensByHash = new Map<string, RefreshTokenRecord>();
  private readonly userTokensByHash = new Map<string, UserActionTokenRecord>();

  issueRefreshToken(
    input: RefreshTokenIssueInput,
  ): ResultAsync<IssuedRefreshToken, AuthTokenStoreError> {
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const issued: IssuedRefreshToken = {
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
    this.refreshTokensByHash.set(tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash,
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
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const issued: IssuedUserActionToken = {
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
    this.userTokensByHash.set(tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      purpose: issued.purpose,
      tokenHash,
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
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const issued: IssuedRefreshToken = {
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
    this.refreshTokensByHash.set(tokenHash, {
      id: issued.id,
      tenantId: issued.tenantId,
      userId: issued.userId,
      tokenHash,
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

function secondsFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function defaultUserActionTokenTtl(purpose: AuthUserTokenPurpose): number {
  return purpose === "email_verification"
    ? DefaultEmailVerificationTtlSeconds
    : DefaultPasswordResetTtlSeconds;
}
