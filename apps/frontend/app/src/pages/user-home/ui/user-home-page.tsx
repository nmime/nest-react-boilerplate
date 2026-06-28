import type { ReactNode } from "react";
import {
  observer,
  useAppStore,
  useI18n,
  type Locale,
  type UiTheme,
} from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
import {
  UiAlert,
  UiButton,
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";
import { AuthPanel } from "../../../widgets/auth-panel";
import { ProfileStatusCard } from "../../../widgets/profile-status";

export interface UserHomePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  actions?: Array<{
    href: string;
    isCurrent?: boolean;
    label: string;
    variant?: "primary" | "secondary";
  }>;
  activeRoute?: string;
  children?: ReactNode;
}

interface UserHomeContentProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

const routeReadiness = [
  { route: "/", group: "Home", value: "dashboard" },
  { route: "/auth", group: "Auth", value: "password + social" },
  { route: "/auth/discord/callback", group: "OAuth", value: "callback" },
  { route: "/profile", group: "Account", value: "profile" },
  { route: "/settings", group: "Account", value: "settings" },
  { route: "/tma", group: "Telegram", value: "mini app" },
  { route: "/tma/auth", group: "Telegram", value: "auth" },
  { route: "/telegram-mini-app", group: "Telegram", value: "alias" },
  { route: "/link/telegram", group: "Linking", value: "telegram" },
  { route: "/link/discord", group: "Linking", value: "discord" },
] as const;

const experienceSignals = [
  { label: "Responsive shell", value: "mobile-first" },
  { label: "State coverage", value: "loading / empty / error / success" },
  { label: "Social linking", value: "Telegram + Discord" },
] as const;

const UserExperienceBanner = observer(function UserExperienceBanner({
  activeRoute,
}: Readonly<{ activeRoute: string }>) {
  const appStore = useAppStore();
  const { t } = useI18n();

  return (
    <section
      aria-label="User app design v3 command center"
      className="xr-v3-banner xr-surface-glow"
      data-design-marker="user-app-frontend-design-v3"
      data-responsive-breakpoint={appStore.currentBreakpoint}
    >
      <div className="xr-v3-banner__copy">
        <span className="xr-v3-kicker">User design v3</span>
        <h2>{t("user.appName")} command center</h2>
        <p>{t("user.description")}</p>
      </div>
      <div className="xr-v3-banner__meta" aria-label="Current route status">
        <UiStatusPill label={activeRoute} tone="info" />
        <UiStatusPill
          label={`layout ${appStore.currentBreakpoint}`}
          tone="info"
        />
        <UiStatusPill label="nonblank smoke marker" tone="success" />
      </div>
    </section>
  );
});

function UserRouteRail({ activeRoute }: Readonly<{ activeRoute: string }>) {
  const activeIndex = routeReadiness.findIndex(
    ({ route }) => route === activeRoute,
  );

  return (
    <aside className="xr-route-rail" aria-label="User route experience map">
      {routeReadiness.map(({ group, route, value }, index) => {
        const isActive = route === activeRoute;
        const readinessLabel = index < activeIndex ? "ready" : "wired";
        const statusLabel = isActive ? "current" : readinessLabel;
        return (
          <a
            aria-current={isActive ? "page" : undefined}
            className="xr-route-rail__item"
            data-active={isActive}
            href={route}
            key={route}
          >
            <span className="xr-route-rail__step">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{route}</strong>
              <small>
                {group} · {value}
              </small>
            </span>
            <UiStatusPill
              label={statusLabel}
              tone={isActive ? "success" : "info"}
            />
          </a>
        );
      })}
    </aside>
  );
}

function UserExperienceFrame({
  activeRoute,
  children,
}: Readonly<{ activeRoute: string; children: ReactNode }>) {
  return (
    <div className="xr-v3-frame">
      <UserExperienceBanner activeRoute={activeRoute} />
      <div className="xr-v3-workspace">
        <div className="xr-v3-primary">{children}</div>
        <UserRouteRail activeRoute={activeRoute} />
      </div>
    </div>
  );
}

function UserReadinessOverview() {
  const { t } = useI18n();

  return (
    <section
      className="xr-readiness-panel"
      aria-label={t("user.routeReadiness.label")}
    >
      <UiCard
        className="xr-route-card xr-surface-glow"
        title={t("user.status")}
      >
        <div className="xr-card-stack">
          <UiAlert className="xr-inline-alert" tone="info">
            <strong>{t("user.routeReadiness.label")}</strong>
            <span>
              Every preserved route now has a visible v3 landing state.
            </span>
          </UiAlert>
          <div
            className="xr-route-list"
            aria-label={t("user.routeReadiness.label")}
          >
            {routeReadiness.map(({ group, route, value }) => (
              <a className="xr-route-chip" href={route} key={route}>
                <span>{route}</span>
                <small>{group}</small>
                <UiStatusPill label={value} tone="success" />
              </a>
            ))}
          </div>
        </div>
      </UiCard>
      <div className="xr-stat-grid xr-stat-grid--compact">
        {experienceSignals.map((signal) => (
          <UiStatCard
            detail={signal.value}
            key={signal.label}
            label={signal.label}
            value="v3"
          />
        ))}
      </div>
    </section>
  );
}

function UserHomeContent({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserHomeContentProps>) {
  const { locale, t } = useI18n();
  const authSession = useAuthSessionFlow({
    applyUserLocale,
    applyUserTheme,
    locale,
    messages: {
      authenticationFailed: t("user.error.authenticationFailed"),
      missingToken: t("user.state.missingToken"),
      profileRequestFailed: t("user.error.profileRequestFailed"),
      profileUnknown: t("user.profile.unknown"),
    },
  });

  return (
    <>
      <UiSection
        className="xr-home-section"
        eyebrow={t("user.eyebrow")}
        title={t("user.title")}
      >
        <div className="xr-home-grid">
          <UiCard
            className="xr-command-card xr-command-card--hero xr-surface-glow"
            title="Start from the safest path"
          >
            <div className="xr-card-stack">
              <p className="xr-lead-copy">{t("user.description")}</p>
              <div
                className="xr-command-actions"
                aria-label={t("user.appName")}
              >
                <UiButton href="/auth">{t("user.form.login")}</UiButton>
                <UiButton href="/profile" variant="secondary">
                  {t("user.action.profile")}
                </UiButton>
                <UiButton href="/settings" variant="secondary">
                  {t("user.nav.settings")}
                </UiButton>
                <UiButton href="/tma" variant="secondary">
                  Telegram mini app
                </UiButton>
              </div>
            </div>
          </UiCard>
          <UiCard
            className="xr-command-card xr-surface-glow"
            title="Account pulse"
          >
            <div className="xr-card-stack">
              <UiAlert className="xr-inline-alert" tone="info">
                <strong>{t("user.nav.profile")}</strong>
                <span>
                  Profile, preferences, and linked identities share one flow.
                </span>
              </UiAlert>
              <div className="xr-status-row">
                <span className="xr-status-heading">Design readiness</span>
                <UiStatusPill label="v3 ready" tone="success" />
              </div>
            </div>
          </UiCard>
        </div>
      </UiSection>
      <UserReadinessOverview />
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        loadingLabel={t("user.loadingProfile")}
        onAuthSubmit={authSession.submitAuth}
        t={t}
      >
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </AuthPanel>
    </>
  );
}

export const UserHomePage = observer(function UserHomePage({
  activeRoute = "/",
  applyUserLocale,
  actions,
  applyUserTheme,
  children,
}: Readonly<UserHomePageProps>) {
  const appStore = useAppStore();
  const { t } = useI18n();
  const productActions = actions ?? [
    { href: "/auth", label: t("user.form.login") },
    {
      href: "/profile",
      label: t("user.action.profile"),
      variant: "secondary" as const,
    },
    {
      href: "/tma",
      label: "Telegram",
      variant: "secondary" as const,
    },
  ];

  return (
    <ProductShell
      actions={productActions}
      appName={t("user.appName")}
      description={t("user.description")}
      eyebrow={t("user.eyebrow")}
      status={`design v3 · ${appStore.currentBreakpoint}`}
      statusTone="success"
      title={t("user.title")}
    >
      <UserExperienceFrame activeRoute={activeRoute}>
        {children ?? (
          <UserHomeContent
            applyUserLocale={applyUserLocale}
            applyUserTheme={applyUserTheme}
          />
        )}
      </UserExperienceFrame>
    </ProductShell>
  );
});
