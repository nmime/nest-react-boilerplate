import type { Locale } from "@app/common/i18n";
import type { UiTheme } from "@app/frontend-ui";
import { UserHomePage } from "../../pages/user-home";

export interface UserRouterProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export function UserRouter({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserRouterProps>) {
  return (
    <UserHomePage
      applyUserLocale={applyUserLocale}
      applyUserTheme={applyUserTheme}
    />
  );
}
