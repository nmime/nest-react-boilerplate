import type { ReactNode } from "react";
import type { Locale } from "@app/common/i18n";
import { useI18n, type UiTheme } from "@app/frontend/ui";
import { useAuthSessionFlow } from "../../../features/auth";
import { ProductShell } from "../../../shared/ui";
import { AuthPanel } from "../../../widgets/auth-panel";
import { ProfileStatusCard } from "../../../widgets/profile-status";

export interface UserHomePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  actions?: Array<{
    href: string;
    label: string;
    variant?: "primary" | "secondary";
  }>;
  children?: ReactNode;
}

interface UserHomeContentProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
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
    <AuthPanel
      isLoginPending={authSession.isLoginPending}
      isRegisterPending={authSession.isRegisterPending}
      loadingLabel={t("user.loadingProfile")}
      onAuthSubmit={authSession.submitAuth}
      t={t}
    >
      <ProfileStatusCard state={authSession.profileState} t={t} />
    </AuthPanel>
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
