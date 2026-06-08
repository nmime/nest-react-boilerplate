import type { Locale } from "@app/common/i18n";
import { useI18n, type UiTheme } from "@app/frontend-ui";
import { useAuthSessionFlow } from "../../../features/auth";
import { ProductShell } from "../../../shared/ui";
import { AuthPanel } from "../../auth-panel";
import { ProfileStatusCard } from "../../profile-status";

export interface UserHomeDashboardProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export function UserHomeDashboard({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserHomeDashboardProps>) {
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
    <ProductShell
      actions={[
        { href: "#auth", label: t("user.form.login") },
        {
          href: "#profile",
          label: t("user.action.profile"),
          variant: "secondary",
        },
      ]}
      appName={t("user.appName")}
      description={t("user.description")}
      eyebrow={t("user.eyebrow")}
      status={t("user.status")}
      statusTone="success"
      title={t("user.title")}
    >
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        loadingLabel={t("user.loadingProfile")}
        onAuthSubmit={authSession.submitAuth}
        t={t}
      >
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </AuthPanel>
    </ProductShell>
  );
}
