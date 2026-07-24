import type { Locale, UiTheme } from '@app/frontend-runtime';

// Shapes of the `/auth/me` and profile payloads that carry locale/theme
// preferences. These describe the auth session, not any one product domain, so
// both the user apps and the admin console read preferences through them.

export interface AuthPrincipalPayload {
  subject?: string;
  email?: string;
  locale?: Locale;
  theme?: UiTheme;
}

export interface AuthUserPayload {
  id?: string;
  subject?: string;
  email?: string | null;
  locale?: Locale;
  theme?: UiTheme;
}

export interface AuthMePayload {
  principal?: AuthPrincipalPayload;
  user?: AuthUserPayload | null;
  profile?: AuthUserPayload | null;
  locale?: Locale;
  theme?: UiTheme;
}

export type AuthSessionPayload = AuthMePayload;

export type AuthPreferencesPayload = AuthMePayload;

export interface UserProfilePayload {
  principal?: AuthPrincipalPayload;
  profile?: AuthUserPayload | null;
  user?: AuthUserPayload | null;
  locale?: Locale;
  theme?: UiTheme;
}

export type LocalePayload = AuthMePayload | UserProfilePayload | undefined;

export interface UserPreferencePatch {
  locale?: Locale;
  theme?: UiTheme;
}
