import { useI18n, type Locale, type UiTheme } from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
import {
  SocialAuthButtons,
  useSocialAuth,
} from "../../../features/social-auth";
import {
  UiAlert,
  UiCard,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";
import { AuthPanel } from "../../../widgets/auth-panel";
import { ProfileStatusCard } from "../../../widgets/profile-status";

interface AuthPageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export function AuthPage({
  applyUserLocale,
  applyUserTheme,
  navigate,
}: Readonly<AuthPageProps>) {
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
  const socialAuth = useSocialAuth({ navigate });

  return (
    <div className="xr-auth-layout" data-design-marker="auth-v3">
      <UiSection
        eyebrow={t("user.nav.auth")}
        title="Choose a secure sign-in route"
      >
        <div className="xr-auth-hero-grid">
          <UiCard
            className="xr-auth-spotlight xr-surface-glow"
            title={t("user.auth.title")}
          >
            <div className="xr-card-stack">
              <UiAlert className="xr-inline-alert" tone="info">
                <strong>Session-first experience</strong>
                <span>
                  Password, Telegram Mini App, and Discord OAuth stay on
                  preserved routes.
                </span>
              </UiAlert>
              <div className="xr-status-row">
                <span className="xr-status-heading">Current auth state</span>
                <UiStatusPill
                  label={authSession.profileState.status}
                  tone={
                    authSession.profileState.status === "ready"
                      ? "success"
                      : "info"
                  }
                />
              </div>
            </div>
          </UiCard>
          <div className="xr-stat-grid xr-stat-grid--compact">
            <UiStatCard
              detail="email + password"
              label="Primary"
              value="form"
            />
            <UiStatCard
              detail="Telegram deep link"
              label="Mobile"
              value="TMA"
            />
            <UiStatCard
              detail="OAuth callback"
              label="Social"
              value="Discord"
            />
          </div>
        </div>
      </UiSection>
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        loadingLabel={t("user.loadingProfile")}
        onAuthSubmit={authSession.submitAuth}
        socialAuthSlot={
          <SocialAuthButtons
            isDiscordPending={socialAuth.isDiscordPending}
            isTelegramPending={socialAuth.isTelegramTmaPending}
            onDiscord={(intent) => socialAuth.continueWithDiscord({ intent })}
            onTelegramTma={() => navigate("/tma/auth", { replace: false })}
            t={t}
          />
        }
        t={t}
      >
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </AuthPanel>
    </div>
  );
}
