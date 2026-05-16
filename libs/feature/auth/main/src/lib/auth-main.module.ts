import { DynamicModule, Module } from "@nestjs/common";
import { PostgresMainModule } from "@app/postgres-main";
import { AuthPostgresModule } from "@app/postgres-main-auth";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  AUTH_USER_STORE,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from "./auth-user-store";

export type AuthPersistenceMode = "postgres" | "memory";

function resolvePersistenceMode(): AuthPersistenceMode {
  if (
    process.env.AUTH_PERSISTENCE === "memory" ||
    (process.env.VITEST && process.env.AUTH_PERSISTENCE !== "postgres")
  ) {
    return "memory";
  }

  return "postgres";
}

@Module({})
export class AuthMainModule {
  static forRoot(
    mode: AuthPersistenceMode = resolvePersistenceMode(),
  ): DynamicModule {
    const useMemory = mode === "memory";
    return {
      module: AuthMainModule,
      imports: useMemory
        ? []
        : [PostgresMainModule.forRoot(), AuthPostgresModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        useMemory
          ? { provide: AUTH_USER_STORE, useClass: InMemoryAuthUserStore }
          : { provide: AUTH_USER_STORE, useClass: PostgresAuthUserStore },
      ],
      exports: [AuthService],
    };
  }
}
