export interface AuthOAuthConfig {
  enabled?: boolean;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface AuthOAuthAuthorizationRequest {
  authorizationUrl: string;
  state: string;
}

export interface AuthOAuthCallbackResult {
  subject: string;
  claims: Record<string, unknown>;
}

export type AuthOAuthErrorCode =
  | "disabled"
  | "not_configured"
  | "provider_error";

export interface AuthOAuthError {
  code: AuthOAuthErrorCode;
  message: string;
}
