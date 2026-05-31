import { describe, expect, it } from "vitest";
import * as stateExports from "./index";

describe("state public exports", () => {
  it("exposes the state package surface through the barrel", () => {
    const exportNames = Object.keys(stateExports);
    const expectedExports = [
      "AuthShellStore",
      "FrontendStateProvider",
      "LocaleStorageKey",
      "LocaleStore",
      "RootStore",
      "ThemeStorageKey",
      "UiStore",
      "createRootStore",
      "detectBrowserLocale",
      "persistLocale",
      "resolveTheme",
      "useAuthShellStore",
      "useLocaleStore",
      "useOptionalRootStore",
      "useRootStore",
      "useUiStore",
    ];

    expect(exportNames).toHaveLength(expectedExports.length);
    for (const exportName of expectedExports) {
      expect(exportNames).toContain(exportName);
    }
  });
});
