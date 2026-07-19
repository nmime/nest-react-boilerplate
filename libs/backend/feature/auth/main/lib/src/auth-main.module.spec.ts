import { describe, expect, it } from 'vitest';
import { AuthMainModule, AuthPersistenceMode } from './auth-main.module';
import { AuthController } from './interfaces/http/auth.controller';
import { ProblemPresentationsController } from './interfaces/http/problem-presentations.controller';
import { BetterAuthApiController } from './application/better-auth-api.controller';
import { BetterAuthModule } from './application/better-auth.module';
import { AuthService } from './application/auth.service';

import {
  AuthTokenStoreInjectToken,
  InMemoryAuthTokenStore,
  PostgresAuthTokenStore,
} from './infrastructure/auth-token-store';
import {
  AuthUserStoreInjectToken,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from './infrastructure/auth-user-store';

describe('AuthMainModule', () => {
  it('creates memory and Postgres dynamic modules', () => {
    const memoryModule = AuthMainModule.forRoot(AuthPersistenceMode.Memory);
    const postgresModule = AuthMainModule.forRoot(AuthPersistenceMode.Postgres);

    expect(memoryModule.controllers).toEqual([AuthController, BetterAuthApiController, ProblemPresentationsController]);
    expect(memoryModule.providers).toContain(AuthService);
    expect(memoryModule.providers).toContainEqual({
      provide: AuthUserStoreInjectToken,
      useClass: InMemoryAuthUserStore,
    });
    expect(memoryModule.providers).toContainEqual({
      provide: AuthTokenStoreInjectToken,
      useClass: InMemoryAuthTokenStore,
    });
    expect(memoryModule.imports).toHaveLength(1);
    expect(memoryModule.imports?.[0]).toMatchObject({ module: BetterAuthModule });
    expect(postgresModule.providers).toContainEqual({
      provide: AuthUserStoreInjectToken,
      useClass: PostgresAuthUserStore,
    });
    expect(postgresModule.providers).toContainEqual({
      provide: AuthTokenStoreInjectToken,
      useClass: PostgresAuthTokenStore,
    });
    expect(postgresModule.imports).toHaveLength(3);
  });

  it('defaults to memory under Vitest unless Postgres is requested', () => {
    const previousVitest = process.env.VITEST;
    const previousPersistence = process.env.AUTH_PERSISTENCE;
    process.env.VITEST = 'true';
    delete process.env.AUTH_PERSISTENCE;

    expect(AuthMainModule.forRoot().imports).toHaveLength(1);
    process.env.AUTH_PERSISTENCE = 'postgres';
    expect(AuthMainModule.forRoot().imports).toHaveLength(3);

    if (previousVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = previousVitest;
    }
    if (previousPersistence === undefined) {
      delete process.env.AUTH_PERSISTENCE;
    } else {
      process.env.AUTH_PERSISTENCE = previousPersistence;
    }
  });

  it('rejects memory auth persistence in production', () => {
    const previousNodeEnvironment = process.env.NODE_ENV as string | undefined;
    const previousPersistence = process.env.AUTH_PERSISTENCE;
    process.env.NODE_ENV = 'production';
    process.env.AUTH_PERSISTENCE = 'memory';

    expect(() => AuthMainModule.forRoot()).toThrow('AUTH_PERSISTENCE=memory is not allowed in production.');
    expect(() => AuthMainModule.forRoot(AuthPersistenceMode.Memory)).toThrow(
      'AUTH_PERSISTENCE=memory is not allowed in production.',
    );

    if (previousNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnvironment;
    }
    if (previousPersistence === undefined) {
      delete process.env.AUTH_PERSISTENCE;
    } else {
      process.env.AUTH_PERSISTENCE = previousPersistence;
    }
  });
});
