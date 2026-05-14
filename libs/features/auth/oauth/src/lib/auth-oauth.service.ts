import { Inject, Injectable, Optional } from "@nestjs/common";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { randomState } from "openid-client";
import type {
  AuthOAuthAuthorizationRequest,
  AuthOAuthCallbackResult,
  AuthOAuthConfig,
  AuthOAuthError,
} from "./auth-oauth.types";

export const AUTH_OAUTH_CONFIG = Symbol("AUTH_OAUTH_CONFIG");

@Injectable()
export class AuthOAuthService {
  constructor(
    @Optional()
    @Inject(AUTH_OAUTH_CONFIG)
    private readonly config: AuthOAuthConfig = {},
  ) {}

  buildAuthorizationRequest(): ResultAsync<
    AuthOAuthAuthorizationRequest,
    AuthOAuthError
  > {
    if (!this.config.enabled) {
      return errAsync({ code: "disabled", message: "OAuth is disabled." });
    }

    const missing = this.getMissingConfiguration([
      "issuerUrl",
      "clientId",
      "redirectUri",
    ]);
    if (missing.length > 0) {
      return errAsync({
        code: "not_configured",
        message: `OAuth configuration is incomplete: ${missing.join(", ")}.`,
      });
    }

    try {
      const state = randomState();
      const scopes = this.config.scopes ?? ["openid", "profile", "email"];
      const issuerUrl = this.config.issuerUrl;
      const clientId = this.config.clientId;
      const redirectUri = this.config.redirectUri;
      const authorizationUrl = new URL("authorize", issuerUrl);
      authorizationUrl.searchParams.set("client_id", clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);

      return okAsync({ authorizationUrl: authorizationUrl.toString(), state });
    } catch (error) {
      return errAsync({
        code: "provider_error",
        message: (error as Error).message,
      });
    }
  }

  handleCallback(): ResultAsync<AuthOAuthCallbackResult, AuthOAuthError> {
    if (!this.config.enabled) {
      return errAsync({ code: "disabled", message: "OAuth is disabled." });
    }

    return errAsync({
      code: "provider_error",
      message:
        "OAuth callback exchange is not configured for this boilerplate.",
    });
  }

  private getMissingConfiguration(
    keys: Array<keyof AuthOAuthConfig>,
  ): string[] {
    return keys.filter((key) => !this.config[key]);
  }
}
