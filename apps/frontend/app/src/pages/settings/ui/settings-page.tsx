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
