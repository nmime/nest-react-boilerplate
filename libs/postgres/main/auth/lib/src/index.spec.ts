import { describe, expect, it } from "vitest";
import * as authPostgres from "./index";

describe("auth postgres exports", () => {
  it("exports public auth data-access APIs", () => {
    expect(authPostgres.AuthPostgresModule).toBeDefined();
    expect(authPostgres.AuthUserEntity).toBeDefined();
    expect(authPostgres.AuthUserRepository).toBeDefined();
  });
});
