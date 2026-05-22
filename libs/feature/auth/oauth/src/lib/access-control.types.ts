export type AuthenticatedLocale = "en" | "es";
export type AuthenticatedTheme = "system" | "light" | "dark";

export interface AuthenticatedPrincipal {
  subject: string;
  email?: string;
  displayName?: string;
  locale?: AuthenticatedLocale;
  theme?: AuthenticatedTheme;
  issuer?: string;
  audience?: string | string[];
  roles: string[];
  permissions: string[];
  tokenId?: string;
}

type SessionCallback = (error?: unknown) => void;
type SessionLifecycleMethod = ((callback: SessionCallback) => void) &
  (() => Promise<void>);

export interface AuthenticatedSession {
  user?: AuthenticatedPrincipal;
  destroy?: SessionLifecycleMethod;
  regenerate?: SessionLifecycleMethod;
  save?: SessionLifecycleMethod;
}

export interface AuthenticatedResponse {
  clearCookie?: (name: string, options?: { path?: string }) => void;
}

export interface AuthenticatedRawRequest {
  res?: AuthenticatedResponse;
}

export interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
  raw?: AuthenticatedRawRequest;
  reply?: AuthenticatedResponse;
  session?: AuthenticatedSession & Record<string, unknown>;
  res?: AuthenticatedResponse;
  user?: AuthenticatedPrincipal;
  auth?: AuthenticatedPrincipal;
}

export interface JwtValidationEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
}
