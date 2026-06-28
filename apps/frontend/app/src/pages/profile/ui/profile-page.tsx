import { useI18n, type Locale, type UiTheme } from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
import {
  UiAlert,
  UiCard,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";
import { ProfileStatusCard } from "../../../widgets/profile-status";

interface ProfilePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export function ProfilePage({
  applyUserLocale,
  applyUserTheme,
}: Readonly<ProfilePageProps>) {
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

  const isReady = authSession.profileState.status === "ready";

  return (
    <UiSection
      className="xr-profile-section"
      eyebrow={t("user.nav.profile")}
      title={t("user.profile.title")}
    >
      <div className="xr-profile-layout" data-design-marker="profile-v3">
        <UiCard
          className="xr-profile-summary xr-surface-glow"
          title="Account overview"
        >
          <div className="xr-card-stack">
            <UiAlert className="xr-inline-alert" tone="info">
              <strong>{t("user.profile.title")}</strong>
              <span>{t("user.description")}</span>
            </UiAlert>
            <div className="xr-status-row">
              <span className="xr-status-heading">Profile readiness</span>
              <UiStatusPill
                label={authSession.profileState.status}
                tone={isReady ? "success" : "info"}
              />
            </div>
          </div>
        </UiCard>
        <div className="xr-stat-grid xr-stat-grid--compact">
          <UiStatCard
            detail="token-aware"
            label="Session"
            value={isReady ? "live" : "needed"}
          />
          <UiStatCard
            detail="locale + theme"
            label="Preferences"
            value="synced"
          />
          <UiStatCard
            detail="Telegram / Discord"
            label="Identity"
            value="linkable"
          />
        </div>
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </div>
    </UiSection>
  );
}
