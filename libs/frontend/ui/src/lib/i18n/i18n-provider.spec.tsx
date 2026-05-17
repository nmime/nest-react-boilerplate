import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    cleanup();
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
  });

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

  it("prefers an authenticated user locale over stored fallback values", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => "en"),
        setItem: vi.fn(),
      },
    });

    render(
      <FrontendI18nProvider userLocale="es">
        <LanguageSwitcher />
        <Example />
      </FrontendI18nProvider>,
    );

    expect(screen.getByText("Idioma")).toBeTruthy();
    expect(screen.getByText(/Lanza una base/u)).toBeTruthy();
  });

  it("persists explicit language switches through the callback and local storage", () => {
    const setItem = vi.fn();
    const onLocaleChange = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem,
      },
    });

    render(
      <FrontendI18nProvider initialLocale="en" onLocaleChange={onLocaleChange}>
        <LanguageSwitcher />
      </FrontendI18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "es" },
    });

    expect(onLocaleChange).toHaveBeenCalledWith("es");
    expect(setItem).toHaveBeenCalledWith("boilerplate.locale", "es");
    expect(screen.getByText("Idioma")).toBeTruthy();
  });

  it("detects query locale before browser fallback", () => {
    installStorage();
    window.history.replaceState(null, "", "/?lang=es");
    expect(detectBrowserLocale()).toBe("es");
  });
});
