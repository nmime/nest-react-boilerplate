import type { Locale } from "@app/common/i18n";
import { useI18n, type UiTheme } from "@app/frontend-ui";
import { useAuthSessionFlow } from "../../../features/auth";
import {
  SocialAuthButtons,
  useSocialAuth,
} from "../../../features/social-auth";
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
  );
}
