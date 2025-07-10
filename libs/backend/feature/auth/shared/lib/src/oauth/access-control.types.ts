import { Language } from './language.enum';
import type { AuthProvider, AuthProviderChannel } from './social-auth.types';
import { createIsEnum } from '../util';

export type AuthenticatedLocale = Language;

export enum AuthenticatedTheme {
  System = 'system',
  Light = 'light',
  Dark = 'dark',
}

export const userThemePreferences = Object.values(AuthenticatedTheme);
export const isAuthenticatedTheme = createIsEnum(AuthenticatedTheme);
export type UserThemePreference = AuthenticatedTheme;

export interface AuthenticatedPrincipal {
  subject: string;
  tenantId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  locale?: AuthenticatedLocale;
  theme?: AuthenticatedTheme;
  issuer?: string;
  audience?: string | string[];
  roles: string[];
  permissions: string[];
  tokenId?: string;
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
  authTime?: number;
  externalIdentityId?: string;
}

type SessionCallback = (error?: unknown) => void;
type SessionLifecycleMethod = ((callback: SessionCallback) => void) & (() => Promise<void>);

export interface AuthenticatedSession {
  user?: AuthenticatedPrincipal;
  destroy?: SessionLifecycleMethod;
  regenerate?: SessionLifecycleMethod;
  save?: SessionLifecycleMethod;
}

export interface AuthenticatedResponse {
  clearCookie?: (name: string, options?: { path?: string }) => void;
  redirect?: (url: string, statusCode?: number) => void;
  send?: (payload?: unknown) => void;
}

export interface AuthenticatedRawRequest {
  res?: AuthenticatedResponse;
}

export interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
  path?: string;
  raw?: AuthenticatedRawRequest;
  reply?: AuthenticatedResponse;
  session?: AuthenticatedSession & Record<string, unknown>;
  res?: AuthenticatedResponse;
  tenantId?: string;
  url?: string;
  user?: AuthenticatedPrincipal;
  auth?: AuthenticatedPrincipal;
}

export interface JwtValidationEnvironment {
  AUTH_JWT_SECRET?: string;
  AUTH_JWT_ISSUER?: string;
  AUTH_JWT_AUDIENCE?: string;
  NODE_ENV?: string;
}
