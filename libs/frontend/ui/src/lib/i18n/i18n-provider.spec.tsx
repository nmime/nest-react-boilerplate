import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FrontendI18nProvider,
  LanguageSwitcher,
  detectBrowserLocale,
  useI18n,
} from "./i18n-provider";

function Example() {
  const { t } = useI18n();
  return <p>{t("landing.title")}</p>;
}

function installStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    },
  });
}

describe("FrontendI18nProvider", () => {
  it("renders translated content from provider locale", () => {
    const html = renderToStaticMarkup(
      <FrontendI18nProvider initialLocale="es">
        <LanguageSwitcher />
        <Example />
      </FrontendI18nProvider>,
    );

    expect(html).toContain("Idioma");
    expect(html).toContain("Lanza una base");
    expect(html).toContain("Español");
  });

  it("detects query locale before browser fallback", () => {
    installStorage();
    window.history.replaceState(null, "", "/?lang=es");
    expect(detectBrowserLocale()).toBe("es");
  });
});
