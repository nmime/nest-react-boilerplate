import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email-address";
import { AuthJwtSigningError, signJwt } from "./jwt-signer";
import { hashPassword, verifyPassword } from "./password.service";
import { InvalidAuthTenantIdError, parseTenantId } from "./tenant-id";

describe("auth domain services", () => {
  it("normalizes email addresses without framework dependencies", () => {
    expect(normalizeEmail(" USER@EXAMPLE.COM ")).toBe("user@example.com");
  });

  it("hashes and verifies password credentials", () => {
    const encoded = hashPassword("password123", "fixed-salt");

    expect(verifyPassword("password123", encoded)).toBe(true);
    expect(verifyPassword("wrongpass", encoded)).toBe(false);
  });

  it("parses tenant ids and reports invalid tenants as domain errors", () => {
    expect(parseTenantId("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(() => parseTenantId("not valid")).toThrow(InvalidAuthTenantIdError);
  });

  it("signs JWTs and reports missing configuration as a domain error", () => {
    expect(() => signJwt({ sub: "user" }, {}, 60)).toThrow(AuthJwtSigningError);
    expect(
      signJwt(
        { sub: "user" },
        { AUTH_JWT_SECRET: "test-secret", NODE_ENV: "test" },
        60,
      ).split("."),
    ).toHaveLength(3);
  });
});
