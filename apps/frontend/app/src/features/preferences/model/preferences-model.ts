import type { Locale, UiTheme } from "@app/frontend/ui";

export interface AppliedUserPreferences {
  locale: Locale | null;
  theme: UiTheme | null;
}

export interface UserPreferencePatch {
  locale?: Locale;
  theme?: UiTheme;
}
