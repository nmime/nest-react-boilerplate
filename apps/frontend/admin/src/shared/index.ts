import {
  translate,
  type TranslationKey,
  type TranslationParams,
} from "@app/frontend/ui";
import { adminFrontendTranslations } from "@app/frontend/feature/admin/i18n";
import type { adminApi } from "@app/frontend/api-client";
import type { AdminAccessPolicy } from "@app/frontend/feature/admin/shared";

type UserStatus = "active" | "disabled" | "invited";

export type Translate = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

export const fallbackTranslate: Translate = (key, params) =>
  translate(key, { params, translations: adminFrontendTranslations });

export const pageSize = 10;

export const statusTone: Record<
  UserStatus | "ready" | "loading" | "error",
  "neutral" | "info" | "success" | "warning"
> = {
  active: "success",
  disabled: "warning",
  invited: "info",
  ready: "success",
  loading: "info",
  error: "warning",
};

export const statusLabelKey: Record<UserStatus, TranslationKey> = {
  active: "admin.status.active",
  disabled: "admin.status.disabled",
  invited: "admin.status.invited",
};

export const normalizeAdminPath = (path: string): string => {
  const normalizedPath = path.split("?")[0]?.replace(/\/$/u, "") || "/";
  if (normalizedPath === "/admin") return "/";
  return normalizedPath.startsWith("/admin/")
    ? normalizedPath.slice("/admin".length) || "/"
    : normalizedPath;
};

export const isUsersRoute = (path: string): boolean => {
  const routePath = normalizeAdminPath(path);
  return routePath === "/users" || routePath.startsWith("/users/");
};

export const routeUserId = (path: string): string | undefined =>
  /^\/users\/([^/?]+)/u.exec(normalizeAdminPath(path))?.[1];

export const paramsFromPath = (path: string) =>
  new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?")) : "");

export const errorText = (
  error: unknown,
  fallbackKey: TranslationKey,
  t: Translate,
) => (error instanceof Error ? error.message : t(fallbackKey));

export const totalPages = (total = 0, limit = pageSize) =>
  Math.max(1, Math.ceil(total / limit));

export const join = (values?: readonly string[]) =>
  values?.length ? values.join(", ") : "—";

export const formatDate = (value?: string) =>
  value ? new Date(value).toISOString() : "—";

export type AdminPrincipal = Partial<adminApi.AuthenticatedPrincipalDto>;

export type AdminProfilePayload = Partial<
  Omit<adminApi.AdminProfilePayloadDto, "principal" | "profile">
> & {
  principal?: AdminPrincipal;
  profile?: Partial<adminApi.AdminProfilePayloadDto["profile"]>;
};

export type AdminProfileState =
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | {
      status: "ready";
      payload: AdminProfilePayload;
      access: AdminAccessPolicy;
    };
