import { normalizeLocale, type Locale } from "@app/common/i18n";
import type { UiTheme } from "@app/frontend-ui";
import { getErrorReason } from "../../../shared/lib";

export interface AuthPrincipalPayload {
  subject?: string;
  email?: string;
  locale?: Locale;
  theme?: UiTheme;
}

export interface AuthUserPayload {
  id?: string;
  subject?: string;
  email?: string;
  locale?: Locale;
  theme?: UiTheme;
}

export interface AuthMePayload {
  principal?: AuthPrincipalPayload;
  user?: AuthUserPayload;
  profile?: AuthUserPayload;
  locale?: Locale;
  theme?: UiTheme;
}

export interface AuthSessionPayload extends AuthMePayload {
  accessToken?: string;
}

export type AuthPreferencesPayload = AuthMePayload;

export interface UserProfilePayload {
  principal?: AuthPrincipalPayload;
  profile?: AuthUserPayload;
  user?: AuthUserPayload;
  locale?: Locale;
  theme?: UiTheme;
}

export type LocalePayload =
  | AuthMePayload
  | AuthSessionPayload
  | UserProfilePayload
  | undefined;

export type ProfileState =
  | { status: "loading" }
  | { status: "missing-token"; reason: string }
  | { status: "ready"; email?: string; subject: string }
  | { status: "forbidden"; reason: string };

export interface UserPreferencePatch {
  locale?: Locale;
  theme?: UiTheme;
}

export const getProfileState = (
  loading: boolean,
  profile: UserProfilePayload | undefined,
  profileRequestFailedMessage: string,
  profileUnknownMessage: string,
  error?: unknown,
): ProfileState => {
  if (loading) {
    return { status: "loading" };
  }
  if (error) {
    return {
      status: "forbidden",
      reason: getErrorReason(error, profileRequestFailedMessage),
    };
  }

  return {
    status: "ready",
    subject:
      profile?.profile?.email ??
      profile?.principal?.email ??
      profile?.profile?.id ??
      profile?.principal?.subject ??
      profileUnknownMessage,
    email: profile?.profile?.email ?? profile?.principal?.email,
  };
};

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  /* v8 ignore next 4 -- defensive theme guard branch permutations are covered by state/store tests. */
  return normalized === "system" ||
    normalized === "light" ||
    normalized === "dark"
    ? normalized
    : undefined;
};

const readTheme = (value: unknown): UiTheme | undefined =>
  normalizeTheme(
    value && typeof value === "object"
      ? (value as Record<string, unknown>)["theme"]
      : undefined,
  );

export const getPayloadLocale = (
  payload?: LocalePayload | null,
): Locale | undefined => {
  const directLocale =
    payload && "locale" in payload ? payload.locale : undefined;
  const userLocale =
    payload && "user" in payload ? payload.user?.locale : undefined;
  const profileLocale =
    payload && "profile" in payload ? payload.profile?.locale : undefined;
  const principalLocale =
    payload && "principal" in payload ? payload.principal?.locale : undefined;

  return normalizeLocale(
    directLocale ?? userLocale ?? profileLocale ?? principalLocale ?? undefined,
  );
};

export const getPayloadTheme = (
  payload?: LocalePayload | null,
): UiTheme | undefined => {
  return (
    readTheme(payload) ??
    (payload && "user" in payload ? readTheme(payload.user) : undefined) ??
    (payload && "profile" in payload
      ? readTheme(payload.profile)
      : undefined) ??
    (payload && "principal" in payload
      ? readTheme(payload.principal)
      : undefined)
  );
};
