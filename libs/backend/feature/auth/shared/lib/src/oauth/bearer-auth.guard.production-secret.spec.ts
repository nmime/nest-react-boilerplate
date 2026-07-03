import { describe, expect, it } from "vitest";
import { validateBearerAuthorization } from "./bearer-auth.guard";

describe("validateBearerAuthorization production secret enforcement", () => {
  it("rejects short production AUTH_JWT_SECRET values before token verification", () => {
    expect(() =>
      validateBearerAuthorization("Bearer header.payload.signature", {
        AUTH_JWT_SECRET: "short",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "AUTH_JWT_SECRET must be at least 32 characters (excluding leading/trailing whitespace) in production.",
    );
  });
});
