import { describe, expect, it } from "vitest";
import {
  AuthOAuthConfigInjectToken,
  AuthOAuthService,
} from "./auth-oauth.service";
import type { AuthOAuthConfig } from "./auth-oauth.types";

const SessionId = "session-1";

function configured(config: Partial<AuthOAuthConfig> = {}): AuthOAuthService {
  return new AuthOAuthService({
    enabled: true,
    issuerUrl: "https://issuer.example/",
    clientId: "client-id",
    redirectUri: "https://app.example/callback",
    ...config,
  });
}

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
    }).buildAuthorizationRequest({ sessionId: SessionId });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("not_configured");
  });

  it("requires a server-side session before starting authorization", async () => {
    const result = await configured().buildAuthorizationRequest();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_request",
      message: "OAuth authorization requires a server-side session.",
    });
  });

  it("builds an authorization URL with a stored cryptographic state", async () => {
    const result = await configured().buildAuthorizationRequest({
      sessionId: SessionId,
    });

    expect(result.isOk()).toBe(true);
    const request = result._unsafeUnwrap();
    const authorizationUrl = new URL(request.authorizationUrl);
    expect(request.authorizationUrl).toContain(
      "https://issuer.example/authorize",
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.get("state")).toBe(request.state);
    expect(authorizationUrl.searchParams.has("nonce")).toBe(false);
    expect(request.state.length).toBeGreaterThanOrEqual(32);
    expect(request.stateExpiresAt).toBeGreaterThan(Date.now());
  });

  it("lists every missing required authorization field", async () => {
    const result = await new AuthOAuthService({
      enabled: true,
      clientId: "client-id",
    }).buildAuthorizationRequest({ sessionId: SessionId });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "not_configured",
      message: "OAuth configuration is incomplete: issuerUrl, redirectUri.",
    });
  });

  it("uses caller-provided scopes", async () => {
    const result = await configured({
      scopes: ["openid", "offline_access"],
    }).buildAuthorizationRequest({ sessionId: SessionId });

    expect(result.isOk()).toBe(true);
    const authorizationUrl = new URL(result._unsafeUnwrap().authorizationUrl);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "openid offline_access",
    );
  });

  it("maps authorization URL construction failures to provider errors", async () => {
    const result = await configured({
      issuerUrl: "not-a-valid-url",
    }).buildAuthorizationRequest({ sessionId: SessionId });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("provider_error");
    expect(result._unsafeUnwrapErr().message).toContain("Invalid URL");
  });

  it("successfully consumes an exact matching state once", async () => {
    const service = configured();
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });
    const request = authorization._unsafeUnwrap();

    const result = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: request.state,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      sessionId: SessionId,
      stateExpiresAt: request.stateExpiresAt,
    });
  });

  it("rejects missing callback state", async () => {
    const result = await configured().consumeAuthorizationState({
      sessionId: SessionId,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_state",
      message: "OAuth callback state is required for this session.",
    });
  });

  it("rejects mismatched state without consuming the valid state", async () => {
    const service = configured();
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });
    const request = authorization._unsafeUnwrap();

    const mismatch = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: `${request.state}-tampered`,
    });
    const valid = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: request.state,
    });

    expect(mismatch.isErr()).toBe(true);
    expect(mismatch._unsafeUnwrapErr().code).toBe("invalid_state");
    expect(valid.isOk()).toBe(true);
  });

  it("binds state to the originating session", async () => {
    const service = configured();
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });

    const result = await service.consumeAuthorizationState({
      sessionId: "other-session",
      state: authorization._unsafeUnwrap().state,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("invalid_state");
  });

  it("rejects replayed state after single-use consumption", async () => {
    const service = configured();
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });
    const callback = {
      sessionId: SessionId,
      state: authorization._unsafeUnwrap().state,
    };

    const first = await service.consumeAuthorizationState(callback);
    const second = await service.consumeAuthorizationState(callback);

    expect(first.isOk()).toBe(true);
    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe("invalid_state");
  });

  it("rejects expired state after the configured TTL", async () => {
    let now = 1_000;
    const service = configured({ clock: () => now, stateTtlMs: 50 });
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });

    now = 1_051;
    const result = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: authorization._unsafeUnwrap().state,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("invalid_state");
  });

  it("stores only allowlisted return URLs with the server-side state", async () => {
    const service = configured({ allowedReturnUrls: ["/dashboard"] });
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
      returnUrl: "/dashboard",
    });

    expect(authorization.isOk()).toBe(true);
    const request = authorization._unsafeUnwrap();
    expect(
      new URL(request.authorizationUrl).searchParams.has("returnUrl"),
    ).toBe(false);
    const consumed = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: request.state,
    });
    expect(consumed._unsafeUnwrap().returnUrl).toBe("/dashboard");
  });

  it("rejects non-allowlisted return URLs", async () => {
    const result = await configured({
      allowedReturnUrls: ["https://app.example/dashboard"],
    }).buildAuthorizationRequest({
      sessionId: SessionId,
      returnUrl: "https://evil.example/phish",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_request",
      message: "OAuth return URL is not allowlisted.",
    });
  });

  it("rejects return URLs when no allowlist is configured", async () => {
    const result = await configured().buildAuthorizationRequest({
      sessionId: SessionId,
      returnUrl: "/dashboard",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_request",
      message: "OAuth return URL is not allowlisted.",
    });
  });

  it("validates callback state before reporting unconfigured provider exchange", async () => {
    const service = configured();
    const authorization = await service.buildAuthorizationRequest({
      sessionId: SessionId,
    });
    const callback = {
      sessionId: SessionId,
      state: authorization._unsafeUnwrap().state,
    };

    const handled = await service.handleCallback(callback);
    const replay = await service.handleCallback(callback);

    expect(handled.isErr()).toBe(true);
    expect(handled._unsafeUnwrapErr()).toEqual({
      code: "provider_error",
      message:
        "OAuth callback exchange is not configured for this boilerplate.",
    });
    expect(replay.isErr()).toBe(true);
    expect(replay._unsafeUnwrapErr().code).toBe("invalid_state");
  });

  it("reports disabled callback handling", async () => {
    const disabled = await new AuthOAuthService().handleCallback();

    expect(disabled._unsafeUnwrapErr()).toEqual({
      code: "disabled",
      message: "OAuth is disabled.",
    });
  });

  it("retains prior non-expired states for a session when issuing a new authorization", async () => {
    const service = configured();
    const first = (
      await service.buildAuthorizationRequest({ sessionId: SessionId })
    )._unsafeUnwrap();
    const second = (
      await service.buildAuthorizationRequest({ sessionId: SessionId })
    )._unsafeUnwrap();

    const consumedFirst = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: first.state,
    });
    const consumedSecond = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: second.state,
    });

    expect(consumedFirst.isOk()).toBe(true);
    expect(consumedSecond.isOk()).toBe(true);
  });

  it("prunes fully expired sessions when issuing a new authorization", async () => {
    let clock = 1_000;
    const service = configured({ clock: () => clock, stateTtlMs: 50 });
    const expiring = (
      await service.buildAuthorizationRequest({ sessionId: "expiring-session" })
    )._unsafeUnwrap();

    clock = 2_000;
    const fresh = (
      await service.buildAuthorizationRequest({ sessionId: SessionId })
    )._unsafeUnwrap();

    const expired = await service.consumeAuthorizationState({
      sessionId: "expiring-session",
      state: expiring.state,
    });
    expect(expired.isErr()).toBe(true);
    expect(expired._unsafeUnwrapErr().code).toBe("invalid_state");
    expect(fresh.state.length).toBeGreaterThanOrEqual(32);
  });

  it("reports disabled state consumption", async () => {
    const result = await new AuthOAuthService().consumeAuthorizationState({
      sessionId: SessionId,
      state: "any-state",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "disabled",
      message: "OAuth is disabled.",
    });
  });

  it("maps state store failures to provider errors", async () => {
    const service = configured({
      stateStore: {
        saveState: () => undefined,
        consumeState: () => {
          throw new Error("store exploded");
        },
      },
    });

    const result = await service.consumeAuthorizationState({
      sessionId: SessionId,
      state: "some-state",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "provider_error",
      message: "store exploded",
    });
  });

  it("rejects protocol-relative, non-http, and malformed return URLs", async () => {
    const service = configured({ allowedReturnUrls: ["/ok"] });

    for (const returnUrl of [
      "//evil.example",
      "ftp://evil.example/x",
      "://nohost",
    ]) {
      // eslint-disable-next-line no-await-in-loop -- each invalid returnUrl case is asserted sequentially
      const result = await service.buildAuthorizationRequest({
        sessionId: SessionId,
        returnUrl,
      });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("invalid_request");
    }
  });

  it("ignores blank allowlisted return URLs while accepting valid ones", async () => {
    const service = configured({ allowedReturnUrls: ["   ", "/dashboard"] });

    const result = await service.buildAuthorizationRequest({
      sessionId: SessionId,
      returnUrl: "/dashboard",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().returnUrl).toBe("/dashboard");
  });

  it("exports a stable injection token for optional configuration", () => {
    expect(AuthOAuthConfigInjectToken.description).toBe(
      "AuthOAuthConfigInjectToken",
    );
  });
});
