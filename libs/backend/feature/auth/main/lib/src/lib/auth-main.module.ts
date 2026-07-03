import { DynamicModule, Module } from "@nestjs/common";
import {
  PostgresMainModule,
  type PostgresMikroOrmOverrides,
} from "@app/backend-postgres-main";
import { AuthPostgresModule } from "@app/backend-postgres-main-auth";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ExternalAuthService } from "./external-auth.service";
import {
  AuthUserStoreInjectToken,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from "./auth-user-store";
import {
  AuthTokenStoreInjectToken,
  InMemoryAuthTokenStore,
  PostgresAuthTokenStore,
} from "./auth-token-store";
import {
  InMemorySocialAuthStore,
  PostgresSocialAuthStore,
  SocialAuthStoreInjectToken,
} from "./social-auth-store";

export enum AuthPersistenceMode {
  Postgres = "postgres",
  Memory = "memory",
}

export interface AuthMainModuleOptions {
  mode?: AuthPersistenceMode;
  postgres?: PostgresMikroOrmOverrides;
}

function assertSafePersistenceMode(mode: AuthPersistenceMode): void {
  if (
    process.env.NODE_ENV === "production" &&
    mode === AuthPersistenceMode.Memory
  ) {
    throw new Error(
      "AUTH_PERSISTENCE=memory is not allowed in production. Configure AUTH_PERSISTENCE=postgres with DATABASE_URL-backed storage.",
    );
  }
}

function resolvePersistenceMode(): AuthPersistenceMode {
  if (
    process.env.AUTH_PERSISTENCE === AuthPersistenceMode.Memory ||
    (process.env.VITEST &&
      process.env.AUTH_PERSISTENCE !== AuthPersistenceMode.Postgres)
  ) {
    return AuthPersistenceMode.Memory;
  }

  return AuthPersistenceMode.Postgres;
}

function normalizeOptions(
  optionsOrMode: AuthPersistenceMode | AuthMainModuleOptions = {},
): Required<AuthMainModuleOptions> {
  if (typeof optionsOrMode === "string") {
    return { mode: optionsOrMode, postgres: {} };
  }

  return {
    mode: optionsOrMode.mode ?? resolvePersistenceMode(),
    postgres: optionsOrMode.postgres ?? {},
  };
}

@Module({})
export class AuthMainModule {
  static forRoot(
    optionsOrMode: AuthPersistenceMode | AuthMainModuleOptions = {},
  ): DynamicModule {
    const options = normalizeOptions(optionsOrMode);
    assertSafePersistenceMode(options.mode);
    const useMemory = options.mode === AuthPersistenceMode.Memory;
    return {
      module: AuthMainModule,
      imports: useMemory
        ? []
        : [PostgresMainModule.forRoot(options.postgres), AuthPostgresModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        ExternalAuthService,
        useMemory
          ? {
              provide: AuthUserStoreInjectToken,
              useClass: InMemoryAuthUserStore,
            }
          : {
              provide: AuthUserStoreInjectToken,
              useClass: PostgresAuthUserStore,
            },
        useMemory
          ? {
              provide: AuthTokenStoreInjectToken,
              useClass: InMemoryAuthTokenStore,
            }
          : {
              provide: AuthTokenStoreInjectToken,
              useClass: PostgresAuthTokenStore,
            },
        useMemory
          ? {
              provide: SocialAuthStoreInjectToken,
              useClass: InMemorySocialAuthStore,
            }
          : {
              provide: SocialAuthStoreInjectToken,
              useClass: PostgresSocialAuthStore,
            },
      ],
      exports: [AuthService, ExternalAuthService],
    };
  }
}
