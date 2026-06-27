import type { Locale } from "@app/common/i18n";
import { useI18n, type UiTheme } from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
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

  return <ProfileStatusCard state={authSession.profileState} t={t} />;
}
