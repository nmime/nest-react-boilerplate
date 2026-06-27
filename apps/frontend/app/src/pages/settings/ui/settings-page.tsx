import { useI18n } from "@app/frontend/ui";
import {
  ProviderIdentitiesPanel,
  useSocialAuth,
  type SocialAuthProvider,
} from "../../../features/social-auth";

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
  );
}
