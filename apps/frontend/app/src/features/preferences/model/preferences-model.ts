import type { Locale } from "@app/common/i18n";
import type { UiTheme } from "@app/frontend/ui";

export interface AppliedUserPreferences {
  locale: Locale | null;
  theme: UiTheme | null;
}

export interface UserPreferencePatch {
  locale?: Locale;
  theme?: UiTheme;
}
