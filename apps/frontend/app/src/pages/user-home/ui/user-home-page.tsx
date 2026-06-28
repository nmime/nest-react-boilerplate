import type { ReactNode } from "react";
import { useI18n, type Locale, type UiTheme } from "@app/frontend/ui";
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
  children?: ReactNode;
}

interface UserHomeContentProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

const routeReadiness = [
  "/",
  "/auth",
  "/auth/discord/callback",
  "/profile",
  "/settings",
  "/tma",
  "/tma/auth",
  "/telegram-mini-app",
  "/link/telegram",
  "/link/discord",
] as const;

function UserReadinessOverview() {
  const { t } = useI18n();

  return (
    <UiSectionReadiness>
      <UiCard
        className="xr-route-card xr-surface-glow"
        title={t("user.status")}
      >
        <div className="xr-card-stack">
          <UiAlert className="xr-inline-alert" tone="info">
            <strong>{t("user.routeReadiness.label")}</strong>
            <span>{t("user.description")}</span>
          </UiAlert>
        </div>
        <div
          className="xr-route-list"
          aria-label={t("user.routeReadiness.label")}
        >
          {routeReadiness.map((route) => (
            <a className="xr-route-chip" href={route} key={route}>
              <span>{route}</span>
              <UiStatusPill label="wired" tone="success" />
            </a>
          ))}
        </div>
      </UiCard>
      <div className="xr-stat-grid xr-stat-grid--compact">
        <UiStatCard
          detail={t("user.auth.title")}
          label={t("user.nav.auth")}
          value="forms"
        />
        <UiStatCard
          detail={t("user.settings.title")}
          label={t("user.nav.settings")}
          value="links"
        />
      </div>
    </UiSectionReadiness>
  );
}

function UiSectionReadiness({ children }: Readonly<{ children: ReactNode }>) {
  return <section className="xr-readiness-panel">{children}</section>;
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
            className="xr-command-card xr-surface-glow"
            title={t("user.status")}
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
              </div>
            </div>
          </UiCard>
          <UiCard
            className="xr-command-card xr-surface-glow"
            title={t("user.profile.title")}
          >
            <div className="xr-card-stack">
              <UiAlert className="xr-inline-alert" tone="info">
                <strong>{t("user.nav.profile")}</strong>
                <span>{t("user.routeReadiness.label")}</span>
              </UiAlert>
              <div className="xr-status-row">
                <span className="xr-status-heading">
                  {t("user.nav.settings")}
                </span>
                <UiStatusPill label={t("user.status")} tone="success" />
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

export function UserHomePage({
  applyUserLocale,
  actions,
  applyUserTheme,
  children,
}: Readonly<UserHomePageProps>) {
  const { t } = useI18n();
  const productActions = actions ?? [
    { href: "/auth", label: t("user.form.login") },
    {
      href: "/profile",
      label: t("user.action.profile"),
      variant: "secondary" as const,
    },
  ];

  return (
    <ProductShell
      actions={productActions}
      appName={t("user.appName")}
      description={t("user.description")}
      eyebrow={t("user.eyebrow")}
      status={t("user.status")}
      statusTone="success"
      title={t("user.title")}
    >
      {children ?? (
        <UserHomeContent
          applyUserLocale={applyUserLocale}
          applyUserTheme={applyUserTheme}
        />
      )}
    </ProductShell>
  );
}
