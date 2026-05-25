import { describe, expect, it } from "vitest";
import { AuthPostgresModule } from "./auth-postgres.module";
import { AuthUserEntity } from "./entity";
import { AuthUserRepository } from "./repository";

describe("AuthPostgresModule", () => {
  it("exposes the auth data-access module pieces", () => {
    expect(AuthPostgresModule).toBeDefined();
    expect(AuthUserEntity).toBeDefined();
    expect(AuthUserRepository).toBeDefined();
  });
});
