import { useI18n } from "@app/frontend/ui";
import {
  ProviderIdentitiesPanel,
  useSocialAuth,
  type SocialAuthProvider,
} from "../../../features/social-auth";
import {
  LanguageSwitcher,
  ThemeSwitcher,
  UiAlert,
  UiCard,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";

interface SettingsPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const linkRoute: Record<SocialAuthProvider, string> = {
  discord: "/link/discord",
  telegram: "/link/telegram",
};

export function SettingsPage({ navigate }: Readonly<SettingsPageProps>) {
  const { t } = useI18n();
  const socialAuth = useSocialAuth({ navigate });

  return (
    <UiSection
      eyebrow={t("user.nav.settings")}
      title={t("user.settings.title")}
    >
      <div className="xr-settings-command" data-design-marker="settings-v3">
        <UiCard
          className="xr-settings-hero xr-surface-glow"
          title="Account control room"
        >
          <div className="xr-card-stack">
            <UiAlert className="xr-inline-alert" tone="info">
              <strong>{t("user.nav.settings")}</strong>
              <span>
                Preferences, linked identities, and recovery paths stay visible
                together.
              </span>
            </UiAlert>
            <div className="xr-status-row">
              <span className="xr-status-heading">Linking routes</span>
              <UiStatusPill label="Telegram + Discord" tone="success" />
            </div>
          </div>
        </UiCard>
        <div className="xr-stat-grid xr-stat-grid--compact">
          <UiStatCard detail="language" label="Locale" value="ready" />
          <UiStatCard
            detail="system / light / dark"
            label="Theme"
            value="ready"
          />
          <UiStatCard detail="OAuth + TMA" label="Providers" value="2" />
        </div>
      </div>
      <div className="xr-settings-grid">
        <UiCard
          className="xr-preferences-card xr-surface-glow"
          title={t("user.settings.title")}
        >
          <UiAlert className="xr-inline-alert" tone="info">
            <strong>{t("user.nav.settings")}</strong>
            <span>{t("user.description")}</span>
          </UiAlert>
          <div className="xr-preferences-controls">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
          <div className="xr-status-row">
            <span>{t("user.nav.settings")}</span>
            <UiStatusPill label="preferences" tone="success" />
          </div>
        </UiCard>
        <ProviderIdentitiesPanel
          onLink={(provider) => {
            if (provider === "discord") {
              socialAuth.continueWithDiscord({ intent: "link" });
              return;
            }
            navigate(linkRoute[provider], { replace: false });
          }}
          t={t}
        />
      </div>
    </UiSection>
  );
}
