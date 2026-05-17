import { QueryClient } from "@tanstack/react-query";
import type { Locale } from "@app/common/i18n";
import {
  apiFetch,
  ApiFetchResponseError,
  normalizeApiBaseUrl,
  type ApiResponseEnvelope,
} from "./api-fetch";

export interface PrincipalPayload {
  subject?: string;
  email?: string;
  locale?: string | null;
}

export interface ProfilePayload {
  principal?: PrincipalPayload;
  profile?: { email?: string; id?: string; locale?: string | null };
}

export interface AuthSessionPayload {
  accessToken?: string;
  principal?: PrincipalPayload;
  user?: { locale?: string | null };
}

export interface AdminPrincipal extends PrincipalPayload {
  displayName?: string;
  roles?: string[];
  permissions?: string[];
}

export interface AdminProfilePayload {
  principal?: AdminPrincipal;
  profile?: {
    id: string;
    email?: string;
    displayName?: string;
    locale?: string | null;
    roles: string[];
    permissions: string[];
  };
}

export interface AuthCredentials {
  email: FormDataEntryValue | null;
  password: FormDataEntryValue | null;
  displayName?: FormDataEntryValue | null;
  locale: Locale;
}

export interface LocalePreferencePayload {
  locale?: string | null;
  user?: { locale?: string | null };
}

const bearerHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
});

const rethrowWithStatus = (error: unknown, prefix: string): never => {
  if (error instanceof ApiFetchResponseError) {
    throw new Error(`${prefix} ${error.status}.`);
  }

  throw error;
};

export const getAuthApiBaseUrl = (value?: string): string =>
  normalizeApiBaseUrl(value);

export const getUserApiBaseUrl = (value?: string): string =>
  normalizeApiBaseUrl(value);

export const getAdminApiBaseUrl = (value?: string): string =>
  normalizeApiBaseUrl(value);

export const createFrontendQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });

export const fetchAuthMe = async (
  token: string,
  locale: Locale,
  apiBaseUrl = "",
  fetchImpl?: typeof fetch,
): Promise<ProfilePayload | undefined> => {
  try {
    const body = await apiFetch<ApiResponseEnvelope<ProfilePayload>>(
      "/auth/me",
      {
        baseUrl: apiBaseUrl,
        fetchImpl,
        headers: bearerHeaders(token),
        locale,
      },
    );

    return body.data;
  } catch {
    return undefined;
  }
};

export const fetchUserProfile = async (
  token: string,
  locale: Locale,
  apiBaseUrl = "",
  fetchImpl?: typeof fetch,
): Promise<ProfilePayload> => {
  try {
    const body = await apiFetch<ApiResponseEnvelope<ProfilePayload>>(
      "/profile/me",
      {
        baseUrl: apiBaseUrl,
        fetchImpl,
        headers: bearerHeaders(token),
        locale,
      },
    );

    return body.data ?? {};
  } catch (error) {
    return rethrowWithStatus(error, "Profile request failed with");
  }
};

export const fetchAdminProfile = async (
  token: string,
  locale: Locale,
  apiBaseUrl = "",
  fetchImpl?: typeof fetch,
): Promise<AdminProfilePayload> => {
  try {
    const body = await apiFetch<ApiResponseEnvelope<AdminProfilePayload>>(
      "/admin/profile/me",
      {
        baseUrl: apiBaseUrl,
        fetchImpl,
        headers: bearerHeaders(token),
        locale,
      },
    );

    return body.data ?? {};
  } catch (error) {
    return rethrowWithStatus(error, "Profile request failed with");
  }
};

export const createAuthSession = async (
  mode: "login" | "register",
  credentials: AuthCredentials,
  apiBaseUrl = "",
  fetchImpl?: typeof fetch,
): Promise<AuthSessionPayload | undefined> => {
  try {
    const body = await apiFetch<ApiResponseEnvelope<AuthSessionPayload>>(
      `/auth/${mode}`,
      {
        baseUrl: apiBaseUrl,
        body: credentials,
        fetchImpl,
        locale: credentials.locale,
        method: "POST",
      },
    );

    return body.data;
  } catch (error) {
    return rethrowWithStatus(error, `${mode} failed with`);
  }
};

export const persistAuthLocale = async (
  token: string,
  locale: Locale,
  apiBaseUrl = "",
  fetchImpl?: typeof fetch,
): Promise<AuthSessionPayload | LocalePreferencePayload | undefined> => {
  const body = await apiFetch<
    ApiResponseEnvelope<AuthSessionPayload | LocalePreferencePayload>
  >("/auth/me/locale", {
    baseUrl: apiBaseUrl,
    body: { locale },
    fetchImpl,
    headers: bearerHeaders(token),
    locale,
    method: "PATCH",
  });

  return body.data;
};
