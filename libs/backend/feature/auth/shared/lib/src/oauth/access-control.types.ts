import type { Language } from './language.enum';
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
  roles: string[];
  permissions: string[];
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
  authTime?: number;
  externalIdentityId?: string;
  emailVerified?: boolean;
  /**
   * Credential epoch this session was minted at. Absent on sessions issued before the account
   * carried one, which the guards read as revision zero.
   */
  credentialRevision?: number;
}

type SessionCallback = (error?: unknown) => void;
type SessionLifecycleMethod = (() => Promise<void> | void) | ((callback: SessionCallback) => void);

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
  ip?: string;
  method?: string;
  get?: (name: string) => string | undefined;
  path?: string;
  raw?: AuthenticatedRawRequest;
  socket?: { remoteAddress?: string };
  routeOptions?: { url?: string };
  reply?: AuthenticatedResponse;
  session?: AuthenticatedSession & Record<string, unknown>;
  res?: AuthenticatedResponse;
  tenantId?: string;
  url?: string;
  user?: AuthenticatedPrincipal;
  auth?: AuthenticatedPrincipal;
}
