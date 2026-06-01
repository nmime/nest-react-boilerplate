import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.service";

describe("auth password hash verification", () => {
  it("accepts valid password hashes and rejects mismatches", () => {
    const encoded = hashPassword("password123", "fixed-salt");

    expect(verifyPassword("password123", encoded)).toBe(true);
    expect(verifyPassword("wrongpass", encoded)).toBe(false);
  });

  it("rejects malformed or unsafe stored hashes without throwing", () => {
    const oversizedDigest = Buffer.alloc(129).toString("base64url");

    expect(verifyPassword("password123", "bad-format")).toBe(false);
    expect(
      verifyPassword("password123", "pbkdf2_sha256$NaN$salt$digest"),
    ).toBe(false);
    expect(
      verifyPassword("password123", "pbkdf2_sha256$0$salt$digest"),
    ).toBe(false);
    expect(
      verifyPassword("password123", "pbkdf2_sha256$1000001$salt$digest"),
    ).toBe(false);
    expect(
      verifyPassword("password123", "pbkdf2_sha256$120000$salt$"),
    ).toBe(false);
    expect(
      verifyPassword(
        "password123",
        `pbkdf2_sha256$120000$salt$${oversizedDigest}`,
      ),
    ).toBe(false);
  });
});
