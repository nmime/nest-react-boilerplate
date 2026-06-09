import { describe, expect, it } from "vitest";
import { AuthPostgresModule } from "./auth-postgres.module";
import { AuthTokenCleanupService } from "./auth-token-cleanup.service";
import {
  AuthRefreshTokenEntity,
  AuthUserEntity,
  AuthUserTokenEntity,
} from "./entity";
import { AuthTokenRepository, AuthUserRepository } from "./repository";

describe("AuthPostgresModule", () => {
  it("exposes the auth data-access module pieces", () => {
    expect(AuthPostgresModule).toBeDefined();
    expect(AuthUserEntity).toBeDefined();
    expect(AuthRefreshTokenEntity).toBeDefined();
    expect(AuthUserTokenEntity).toBeDefined();
    expect(AuthUserRepository).toBeDefined();
    expect(AuthTokenRepository).toBeDefined();
    expect(AuthTokenCleanupService).toBeDefined();
  });
});
