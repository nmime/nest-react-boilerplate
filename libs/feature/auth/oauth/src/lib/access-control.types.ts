export type AuthenticatedLocale = "en" | "es";

export interface AuthenticatedPrincipal {
  subject: string;
  email?: string;
  displayName?: string;
  locale?: AuthenticatedLocale;
  issuer?: string;
  audience?: string | string[];
  roles: string[];
  permissions: string[];
  tokenId?: string;
}

export interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
  user?: AuthenticatedPrincipal;
  auth?: AuthenticatedPrincipal;
}

export interface JwtValidationEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
}
