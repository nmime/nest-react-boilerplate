import { useI18n, type Locale, type UiTheme } from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
import { UiAlert, UiSection } from "../../../shared/ui";
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

  return (
    <UiSection eyebrow={t("user.nav.profile")} title={t("user.profile.title")}>
      <UiAlert tone="info">{t("user.description")}</UiAlert>
      <ProfileStatusCard state={authSession.profileState} t={t} />
    </UiSection>
  );
}
