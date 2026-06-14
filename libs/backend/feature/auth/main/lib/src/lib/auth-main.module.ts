import { DynamicModule, Module } from "@nestjs/common";
import {
  PostgresMainModule,
  type PostgresMikroOrmOverrides,
} from "@app/postgres-main";
import { AuthPostgresModule } from "@app/postgres-main-auth";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ExternalAuthService } from "./external-auth.service";
import {
  AUTH_USER_STORE,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from "./auth-user-store";
import {
  AUTH_TOKEN_STORE,
  InMemoryAuthTokenStore,
  PostgresAuthTokenStore,
} from "./auth-token-store";
import {
  InMemorySocialAuthStore,
  PostgresSocialAuthStore,
  SOCIAL_AUTH_STORE,
} from "./social-auth-store";

export type AuthPersistenceMode = "postgres" | "memory";

export interface AuthMainModuleOptions {
  mode?: AuthPersistenceMode;
  postgres?: PostgresMikroOrmOverrides;
}

function assertSafePersistenceMode(mode: AuthPersistenceMode): void {
  if (process.env.NODE_ENV === "production" && mode === "memory") {
    throw new Error(
      "AUTH_PERSISTENCE=memory is not allowed in production. Configure AUTH_PERSISTENCE=postgres with DATABASE_URL-backed storage.",
    );
  }
}

function resolvePersistenceMode(): AuthPersistenceMode {
  if (
    process.env.AUTH_PERSISTENCE === "memory" ||
    (process.env.VITEST && process.env.AUTH_PERSISTENCE !== "postgres")
  ) {
    return "memory";
  }

  return "postgres";
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
    const useMemory = options.mode === "memory";
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
          ? { provide: AUTH_USER_STORE, useClass: InMemoryAuthUserStore }
          : { provide: AUTH_USER_STORE, useClass: PostgresAuthUserStore },
        useMemory
          ? { provide: AUTH_TOKEN_STORE, useClass: InMemoryAuthTokenStore }
          : { provide: AUTH_TOKEN_STORE, useClass: PostgresAuthTokenStore },
        useMemory
          ? { provide: SOCIAL_AUTH_STORE, useClass: InMemorySocialAuthStore }
          : { provide: SOCIAL_AUTH_STORE, useClass: PostgresSocialAuthStore },
      ],
      exports: [AuthService, ExternalAuthService],
    };
  }
}
