import type { authApi } from "@app/api-client";
import { type FrontendEnv } from "@app/frontend-api-support";
import {
  getAdminApiBaseUrl,
  getAuthApiBaseUrl,
} from "../../../entities/admin-session";

export type AuthMePayload = authApi.AuthControllerMeData;

const sensitiveUrlTokenParams = ["admin_token", "access_token", "token"];

export const stripSensitiveBrowserTokenParams = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const hadSensitiveParams = sensitiveUrlTokenParams.some((param) =>
    url.searchParams.has(param),
  );
  if (!hadSensitiveParams) {
    return;
  }

  for (const param of sensitiveUrlTokenParams) {
    url.searchParams.delete(param);
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
};

export const getBrowserPath = (): string => {
  if (typeof window === "undefined") {
    return "/";
  }

  stripSensitiveBrowserTokenParams();
  return window.location.pathname;
};

export { sensitiveUrlTokenParams };

export const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

export const getConfiguredAdminApiBaseUrl = (): string =>
  getAdminApiBaseUrl(getFrontendEnv());

export const getConfiguredAuthApiBaseUrl = (): string =>
  getAuthApiBaseUrl(getFrontendEnv());
