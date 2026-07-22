import { describe, expect, it } from 'vitest';
import { AuthPostgresModule } from './auth-postgres.module';
import { AuthTokenCleanupService } from './auth-token-cleanup.service';
import { AuthUserEntity, AuthUserTokenEntity } from './infrastructure/data-access/entities';
import {
  AuthRoleRepository,
  AuthTokenRepository,
  AuthUserRepository,
  AuthUserRoleRepository,
} from './infrastructure/data-access/repositories';

describe('AuthPostgresModule', () => {
  it('exposes the auth data-access module pieces', () => {
    expect(AuthPostgresModule).toBeDefined();
    expect(AuthUserEntity).toBeDefined();
    expect(AuthUserTokenEntity).toBeDefined();
    expect(AuthUserRepository).toBeDefined();
    expect(AuthTokenRepository).toBeDefined();
    expect(AuthRoleRepository).toBeDefined();
    expect(AuthUserRoleRepository).toBeDefined();
    expect(AuthTokenCleanupService).toBeDefined();
  });
});
