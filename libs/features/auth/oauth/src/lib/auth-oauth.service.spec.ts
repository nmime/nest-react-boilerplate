import { describe, expect, it } from "vitest";
import { AuthOAuthService } from "./auth-oauth.service";

describe("AuthOAuthService", () => {
  it("is disabled by default", async () => {
    const result = await new AuthOAuthService().buildAuthorizationRequest();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "disabled",
      message: "OAuth is disabled.",
    });
  });

  it("reports missing configuration without network calls", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
    }).buildAuthorizationRequest();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_configured");
  });

  it("builds an authorization URL locally when configured", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
      issuerUrl: "https://issuer.example/",
      clientId: "client-id",
      redirectUri: "https://app.example/callback",
    }).buildAuthorizationRequest();

    expect(result.isOk()).toBe(true);
    const request = result._unsafeUnwrap();
    expect(request.authorizationUrl).toContain(
      "https://issuer.example/authorize",
    );
    expect(request.authorizationUrl).toContain("client_id=client-id");
    expect(request.state.length).toBeGreaterThan(8);
  });
});
