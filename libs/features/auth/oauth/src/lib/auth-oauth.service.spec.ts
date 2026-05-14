import { describe, expect, it } from "vitest";
import { AUTH_OAUTH_CONFIG, AuthOAuthService } from "./auth-oauth.service";

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

  it("lists every missing required authorization field", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
      clientId: "client-id",
    }).buildAuthorizationRequest();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "not_configured",
      message: "OAuth configuration is incomplete: issuerUrl, redirectUri.",
    });
  });

  it("uses caller-provided scopes", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
      issuerUrl: "https://issuer.example/",
      clientId: "client-id",
      redirectUri: "https://app.example/callback",
      scopes: ["openid", "offline_access"],
    }).buildAuthorizationRequest();

    expect(result.isOk()).toBe(true);
    const authorizationUrl = new URL(result._unsafeUnwrap().authorizationUrl);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "openid offline_access",
    );
  });

  it("maps authorization URL construction failures to provider errors", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
      issuerUrl: "not-a-valid-url",
      clientId: "client-id",
      redirectUri: "https://app.example/callback",
    }).buildAuthorizationRequest();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("provider_error");
    expect(result._unsafeUnwrapErr().message).toContain("Invalid URL");
  });

  it("reports disabled and not-implemented callback handling", async () => {
    const disabled = await new AuthOAuthService().handleCallback();
    const enabled = await new AuthOAuthService({
      enabled: true,
    }).handleCallback();

    expect(disabled._unsafeUnwrapErr()).toEqual({
      code: "disabled",
      message: "OAuth is disabled.",
    });
    expect(enabled._unsafeUnwrapErr()).toEqual({
      code: "provider_error",
      message:
        "OAuth callback exchange is not configured for this boilerplate.",
    });
  });

  it("exports a stable injection token for optional configuration", () => {
    expect(AUTH_OAUTH_CONFIG.description).toBe("AUTH_OAUTH_CONFIG");
  });
});
