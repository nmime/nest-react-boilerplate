import type { Locale, UiTheme } from "@app/frontend-runtime";

export interface AppliedUserPreferences {
  locale: Locale | null;
  theme: UiTheme | null;
}

export interface UserPreferencePatch {
  locale?: Locale;
  theme?: UiTheme;
}
