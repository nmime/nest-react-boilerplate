import { describe, expect, it } from "vitest";
import { AuthMainModule } from "./auth-main.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  AUTH_USER_STORE,
  InMemoryAuthUserStore,
  PostgresAuthUserStore,
} from "./auth-user-store";

describe("AuthMainModule", () => {
  it("creates memory and Postgres dynamic modules", () => {
    const memoryModule = AuthMainModule.forRoot("memory");
    const postgresModule = AuthMainModule.forRoot("postgres");

    expect(memoryModule.controllers).toEqual([AuthController]);
    expect(memoryModule.providers).toContain(AuthService);
    expect(memoryModule.providers).toContainEqual({
      provide: AUTH_USER_STORE,
      useClass: InMemoryAuthUserStore,
    });
    expect(memoryModule.imports).toEqual([]);
    expect(postgresModule.providers).toContainEqual({
      provide: AUTH_USER_STORE,
      useClass: PostgresAuthUserStore,
    });
    expect(postgresModule.imports).toHaveLength(2);
  });

  it("defaults to memory under Vitest unless Postgres is requested", () => {
    const previousVitest = process.env.VITEST;
    const previousPersistence = process.env.AUTH_PERSISTENCE;
    process.env.VITEST = "true";
    delete process.env.AUTH_PERSISTENCE;

    expect(AuthMainModule.forRoot().imports).toEqual([]);
    process.env.AUTH_PERSISTENCE = "postgres";
    expect(AuthMainModule.forRoot().imports).toHaveLength(2);

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
});
