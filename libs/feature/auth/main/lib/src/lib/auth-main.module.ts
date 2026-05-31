import { DynamicModule, Module } from "@nestjs/common";
import {
  PostgresMainModule,
  type PostgresMikroOrmOverrides,
} from "@app/postgres-main";
import { AuthPostgresModule } from "@app/postgres-main-auth";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  AUTH_USER_STORE,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from "./auth-user-store";
import { AUTH_TOKEN_STORE, InMemoryAuthTokenStore } from "./auth-token-store";

export type AuthPersistenceMode = "postgres" | "memory";

export interface AuthMainModuleOptions {
  mode?: AuthPersistenceMode;
  postgres?: PostgresMikroOrmOverrides;
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
    const useMemory = options.mode === "memory";
    return {
      module: AuthMainModule,
      imports: useMemory
        ? []
        : [PostgresMainModule.forRoot(options.postgres), AuthPostgresModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        useMemory
          ? { provide: AUTH_USER_STORE, useClass: InMemoryAuthUserStore }
          : { provide: AUTH_USER_STORE, useClass: PostgresAuthUserStore },
        { provide: AUTH_TOKEN_STORE, useClass: InMemoryAuthTokenStore },
      ],
      exports: [AuthService],
    };
  }
}
