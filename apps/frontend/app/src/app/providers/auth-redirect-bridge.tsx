import { useEffect } from "react";
import {
  apiRuntimeEvents,
  clearApiAuthRequired,
} from "@app/frontend/api-support";
import { isTmaApp, type TmaEnvironment } from "@app/frontend/ui";

const defaultAuthRoute = "/auth";

const normalizePath = (path: string): string => {
  const normalized = path.trim() || "/";
  return normalized.endsWith("/") && normalized !== "/"
    ? normalized.slice(0, -1)
    : normalized;
};

const safeInternalPath = (value: string | null | undefined): string | null => {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  const url = new URL(value, globalThis.location?.origin ?? "http://localhost");
  return `${url.pathname}${url.search}`;
};

const isAuthRoute = (path: string, authRoute: string): boolean => {
  const route = normalizePath(path);
  const normalizedAuthRoute = normalizePath(authRoute);
  return (
    route === normalizedAuthRoute || route.startsWith(`${normalizedAuthRoute}/`)
  );
};

const isTelegramRoute = (path: string): boolean => {
  const route = normalizePath(path);
  return (
    route === "/tma" ||
    route === "/tma/auth" ||
    route === "/telegram-mini-app" ||
    route === "/link/telegram"
  );
};

const tmaEnvironment = (): TmaEnvironment => {
  const env = import.meta.env as Partial<
    Record<keyof TmaEnvironment, string | undefined>
  >;
  return {
    VITE_TMA_APP: env.VITE_TMA_APP,
  };
};

const currentReturnUrl = (): string => {
  const pathname = globalThis.location?.pathname ?? "/";
  const search = globalThis.location?.search ?? "";
  return safeInternalPath(`${pathname}${search}`) ?? "/";
};

const buildAuthRedirectUrl = (
  redirectTo: string | undefined,
  returnUrl: string,
): string => {
  const authRoute = safeInternalPath(redirectTo) ?? defaultAuthRoute;
  const url = new URL(
    authRoute,
    globalThis.location?.origin ?? "http://localhost",
  );
  url.searchParams.set("returnUrl", returnUrl);
  return `${url.pathname}${url.search}`;
};

const navigateReplace = (to: string): void => {
  globalThis.history?.replaceState(null, "", to);
  globalThis.dispatchEvent?.(new Event("popstate"));
};

export const AuthRedirectBridge = () => {
  useEffect(
    () =>
      apiRuntimeEvents.subscribe((event) => {
        if (event.type !== "auth-required") {
          return;
        }

        const pathname = globalThis.location?.pathname ?? "/";
        const authRoute =
          safeInternalPath(event.redirectTo) ?? defaultAuthRoute;
        if (isAuthRoute(pathname, authRoute)) {
          clearApiAuthRequired();
          return;
        }

        if (isTelegramRoute(pathname) || isTmaApp(tmaEnvironment())) {
          return;
        }

        clearApiAuthRequired();
        navigateReplace(
          buildAuthRedirectUrl(event.redirectTo, currentReturnUrl()),
        );
      }),
    [],
  );

  return null;
};
