import type { Locale } from "@app/common/i18n";
import type { UiTheme } from "@app/frontend-ui";
import { UserHomeDashboard } from "../../../widgets/user-home-dashboard";

export interface UserHomePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export function UserHomePage({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserHomePageProps>) {
  return (
    <UserHomeDashboard
      applyUserLocale={applyUserLocale}
      applyUserTheme={applyUserTheme}
    />
  );
}
