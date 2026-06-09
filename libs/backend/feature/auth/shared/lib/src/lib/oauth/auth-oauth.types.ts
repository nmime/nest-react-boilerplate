export interface AuthOAuthConfig {
  enabled?: boolean;
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  stateTtlMs?: number;
  allowedReturnUrls?: string[];
  clock?: () => number;
  stateStore?: AuthOAuthStateStore;
}

export interface AuthOAuthAuthorizationInput {
  sessionId?: string | null;
  returnUrl?: string | null;
}

export interface AuthOAuthAuthorizationRequest {
  authorizationUrl: string;
  state: string;
  stateExpiresAt: number;
  returnUrl?: string;
}

export interface AuthOAuthCallbackInput {
  sessionId?: string | null;
  state?: string | null;
}

export interface AuthOAuthCallbackResult {
  subject: string;
  claims: Record<string, unknown>;
}

export interface AuthOAuthConsumedState {
  sessionId: string;
  stateExpiresAt: number;
  returnUrl?: string;
}

export interface AuthOAuthStoredState {
  sessionId: string;
  stateHash: string;
  createdAt: number;
  expiresAt: number;
  returnUrl?: string;
}

export interface AuthOAuthStateStore {
  saveState(state: AuthOAuthStoredState): void;
  consumeState(input: {
    sessionId: string;
    stateHash: string;
    now: number;
  }): AuthOAuthStoredState | undefined;
}

export type AuthOAuthErrorCode =
  | "disabled"
  | "not_configured"
  | "invalid_request"
  | "invalid_state"
  | "provider_error";

export interface AuthOAuthError {
  code: AuthOAuthErrorCode;
  message: string;
}
