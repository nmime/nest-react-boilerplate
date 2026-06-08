import type { authApi } from "@app/api-client";
import { type FrontendEnv } from "@app/frontend-ui";
import {
  getAdminApiBaseUrl,
  getAuthApiBaseUrl,
} from "../../../entities/admin-session";

export type AuthMePayload = authApi.AuthControllerMeData;

export const getBrowserPath = (): string =>
  typeof window === "undefined" ? "/" : window.location.pathname;

export const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

export const getConfiguredAdminApiBaseUrl = (): string =>
  getAdminApiBaseUrl(getFrontendEnv());

export const getConfiguredAuthApiBaseUrl = (): string =>
  getAuthApiBaseUrl(getFrontendEnv());
