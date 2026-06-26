import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Locale } from "@app/common/i18n";
import { useI18n, type UiTheme } from "@app/frontend-ui";
import { AuthPage } from "../../pages/auth";
import { AuthDiscordCallbackPage } from "../../pages/auth-discord-callback";
import { ProfilePage } from "../../pages/profile";
import { SettingsPage } from "../../pages/settings";
import { TmaPage } from "../../pages/tma";
import { UserHomePage } from "../../pages/user-home";

export interface UserRouterProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

type NavigateOptions = { replace?: boolean };

const getPathname = () => globalThis.location?.pathname ?? "/";
const subscribeToNavigation = (listener: () => void) => {
  globalThis.addEventListener?.("popstate", listener);
  return () => globalThis.removeEventListener?.("popstate", listener);
};

const normalizePath = (path: string): string => {
  const normalized = path.trim() || "/";
  return normalized.endsWith("/") && normalized !== "/"
    ? normalized.slice(0, -1)
    : normalized;
};

const getLinkRoute = (
  path: string,
): "/link/telegram" | "/link/discord" | null => {
  const normalized = normalizePath(path);
  if (normalized === "/link/telegram" || normalized === "/link/discord") {
    return normalized;
  }
  return null;
};

export function UserRouter({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserRouterProps>) {
  const { t } = useI18n();
  const pathname = useSyncExternalStore(
    subscribeToNavigation,
    getPathname,
    () => "/",
  );
  const route = normalizePath(pathname);
  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const nextUrl = new URL(
      to,
      globalThis.location?.origin ?? "http://localhost",
    );
    if (options.replace) {
      globalThis.history.replaceState(
        null,
        "",
        nextUrl.pathname + nextUrl.search,
      );
    } else {
      globalThis.history.pushState(null, "", nextUrl.pathname + nextUrl.search);
    }
    globalThis.dispatchEvent(new Event("popstate"));
  }, []);
  const navActions = useMemo(
    () => [
      { href: "/", label: t("user.nav.home") },
      {
        href: "/auth",
        label: t("user.nav.auth"),
        variant: "secondary" as const,
      },
      {
        href: "/profile",
        label: t("user.nav.profile"),
        variant: "secondary" as const,
      },
      {
        href: "/settings",
        label: t("user.nav.settings"),
        variant: "secondary" as const,
      },
    ],
    [t],
  );
  const linkRoute = getLinkRoute(route);

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/")) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    globalThis.document?.addEventListener("click", clickHandler);
    return () =>
      globalThis.document?.removeEventListener("click", clickHandler);
  }, [navigate]);

  const renderRoute = () => {
    if (route === "/auth/discord/callback") {
      return <AuthDiscordCallbackPage navigate={navigate} />;
    }

    if (route === "/auth") {
      return (
        <AuthPage
          applyUserLocale={applyUserLocale}
          applyUserTheme={applyUserTheme}
          navigate={navigate}
        />
      );
    }

    if (route === "/profile") {
      return (
        <ProfilePage
          applyUserLocale={applyUserLocale}
          applyUserTheme={applyUserTheme}
        />
      );
    }

    if (route === "/settings") {
      return <SettingsPage navigate={navigate} />;
    }

    if (
      route === "/tma" ||
      route === "/tma/auth" ||
      route === "/telegram-mini-app"
    ) {
      return <TmaPage navigate={navigate} />;
    }

    if (linkRoute === "/link/telegram") {
      return <TmaPage fallbackStartParam="link_telegram" navigate={navigate} />;
    }

    if (linkRoute === "/link/discord") {
      return <SettingsPage navigate={navigate} />;
    }

    return (
      <UserHomePage
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
      />
    );
  };

  if (route === "/") {
    return (
      <UserHomePage
        actions={navActions}
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
      />
    );
  }

  return (
    <UserHomePage
      actions={navActions}
      applyUserLocale={applyUserLocale}
      applyUserTheme={applyUserTheme}
    >
      {renderRoute()}
    </UserHomePage>
  );
}
