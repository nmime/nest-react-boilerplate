import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { AuthController, PersistentSessionAccessGuard, ProblemPresentationsController } from './interfaces/http';
import { BetterAuthApiController } from './application/better-auth-api.controller';
import { BetterAuthModule } from './application/better-auth.module';
import {
  AuthService,
  AuthLoginAnalyticsService,
  AuthNotificationPublisher,
  BetterAuthTelegramSessionService,
  EffectivePermissionService,
  ExternalAuthService,
  GeoIpResolverService,
  InMemoryProblemPresentationReader,
  PostgresProblemPresentationReader,
  ProblemPresentationReaderProvider,
} from './application';
import {
  AuthRoleStoreInjectToken,
  AuthUserStoreInjectToken,
  InMemoryAuthRoleStore,
  InMemoryAuthUserStore,
  PostgresAuthRoleStore,
  PostgresAuthUserStore,
  AuthTokenStoreInjectToken,
  InMemoryAuthTokenStore,
  PostgresAuthTokenStore,
  InMemorySocialAuthStore,
  PostgresSocialAuthStore,
  SocialAuthStoreInjectToken,
} from './infrastructure';

export enum AuthPersistenceMode {
  Postgres = 'postgres',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- public mode name follows MongoDB branding
  MongoDB = 'mongodb',
  Memory = 'memory',
}

export interface AuthMainModuleOptions {
  mode?: AuthPersistenceMode;
}

function assertSafePersistenceMode(mode: AuthPersistenceMode): void {
  if (process.env.NODE_ENV === 'production' && mode === AuthPersistenceMode.Memory) {
    throw new Error(
      'AUTH_PERSISTENCE=memory is not allowed in production. Configure AUTH_PERSISTENCE=postgres or mongodb.',
    );
  }
}

function resolvePersistenceMode(): AuthPersistenceMode {
  if (
    process.env.AUTH_PERSISTENCE === AuthPersistenceMode.Memory ||
    (process.env.VITEST && !process.env.AUTH_PERSISTENCE)
  ) {
    return AuthPersistenceMode.Memory;
  }

  return process.env.AUTH_PERSISTENCE === AuthPersistenceMode.MongoDB
    ? AuthPersistenceMode.MongoDB
    : AuthPersistenceMode.Postgres;
}

function normalizeOptions(
  optionsOrMode: AuthPersistenceMode | AuthMainModuleOptions = {},
): Required<AuthMainModuleOptions> {
  if (typeof optionsOrMode === 'string') {
    return { mode: optionsOrMode };
  }

  return {
    mode: optionsOrMode.mode ?? resolvePersistenceMode(),
  };
}

function persistenceProviders(mode: AuthPersistenceMode): Provider[] {
  if (mode === AuthPersistenceMode.Memory) {
    return [
      { provide: ProblemPresentationReaderProvider, useClass: InMemoryProblemPresentationReader },
      { provide: AuthRoleStoreInjectToken, useClass: InMemoryAuthRoleStore },
      { provide: AuthUserStoreInjectToken, useClass: InMemoryAuthUserStore },
      { provide: AuthTokenStoreInjectToken, useClass: InMemoryAuthTokenStore },
      { provide: SocialAuthStoreInjectToken, useClass: InMemorySocialAuthStore },
    ];
  }

  // Durable stores are provider-agnostic adapters: they talk to the repository
  // ports supplied via inject tokens, and the capability module decides which
  // implementation provides them (`AuthPostgresModule` for Postgres,
  // `AuthMongoPersistenceModule` for MongoDB), so the Postgres and MongoDB
  // modes intentionally share the same adapter set. The bootstrap additionally
  // refuses to start when `AUTH_PERSISTENCE` does not match the compiled
  // durable database provider, so selecting `mongodb` in a Postgres-only
  // workspace fails loudly rather than silently wiring the wrong stores.
  return [
    { provide: ProblemPresentationReaderProvider, useClass: PostgresProblemPresentationReader },
    { provide: AuthRoleStoreInjectToken, useClass: PostgresAuthRoleStore },
    { provide: AuthUserStoreInjectToken, useClass: PostgresAuthUserStore },
    { provide: AuthTokenStoreInjectToken, useClass: PostgresAuthTokenStore },
    { provide: SocialAuthStoreInjectToken, useClass: PostgresSocialAuthStore },
  ];
}

@Module({})
export class AuthMainModule {
  static forRoot(optionsOrMode: AuthPersistenceMode | AuthMainModuleOptions = {}): DynamicModule {
    const options = normalizeOptions(optionsOrMode);
    assertSafePersistenceMode(options.mode);
    return {
      module: AuthMainModule,
      imports: [BetterAuthModule.forRoot()],
      controllers: [AuthController, BetterAuthApiController, ProblemPresentationsController],
      providers: [
        AuthService,
        AuthLoginAnalyticsService,
        AuthNotificationPublisher,
        ExternalAuthService,
        GeoIpResolverService,
        BetterAuthTelegramSessionService,
        PersistentSessionAccessGuard,
        EffectivePermissionService,
        ...persistenceProviders(options.mode),
      ],
      exports: [
        AuthService,
        ExternalAuthService,
        BetterAuthTelegramSessionService,
        EffectivePermissionService,
        PersistentSessionAccessGuard,
      ],
    };
  }
}
