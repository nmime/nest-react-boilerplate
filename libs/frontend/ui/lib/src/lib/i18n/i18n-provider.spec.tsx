import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { landingFrontendTranslations } from "@app/common/i18n/frontend-landing";
import {
  FrontendI18nProvider,
  LanguageSwitcher,
  ThemeSwitcher,
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

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
}

function chooseSelectOption(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });

  installRadixPointerMocks();
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });

  const optionElement = document.querySelector<HTMLElement>(
    `[role="option"][data-value="${option}"]`,
  );

  expect(optionElement).toBeTruthy();
  fireEvent.click(optionElement as HTMLElement);
}

describe("FrontendI18nProvider", () => {
  afterEach(() => {
    cleanup();
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
  });

  it("renders translated content from provider locale", () => {
    const html = renderToStaticMarkup(
      <FrontendI18nProvider
        initialLocale="ru"
        translations={landingFrontendTranslations}
      >
        <LanguageSwitcher />
        <ThemeSwitcher />
        <Example />
      </FrontendI18nProvider>,
    );

    expect(html).toContain("Язык");
    expect(html).toContain("Тема");
    expect(html).toContain("Запустите готовую full-stack основу");
    expect(html).toContain("Русский");
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
      <FrontendI18nProvider
        translations={landingFrontendTranslations}
        userLocale="ru"
      >
        <LanguageSwitcher />
        <Example />
      </FrontendI18nProvider>,
    );

    expect(screen.getByText("Язык")).toBeTruthy();
    expect(
      screen.getByText(/Запустите готовую full-stack основу/u),
    ).toBeTruthy();
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

    expect(
      document.querySelectorAll(".xr-language-switcher select"),
    ).toHaveLength(0);

    chooseSelectOption("Language", "ru");

    expect(onLocaleChange).toHaveBeenCalledWith("ru");
    expect(setItem).toHaveBeenCalledWith("boilerplate.locale", "ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(screen.getByText("Язык")).toBeTruthy();
  });

  it("persists explicit theme switches through callback and local storage", () => {
    const setItem = vi.fn();
    const onThemeChange = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem,
      },
    });

    render(
      <FrontendI18nProvider initialTheme="system" onThemeChange={onThemeChange}>
        <ThemeSwitcher />
      </FrontendI18nProvider>,
    );

    expect(document.querySelectorAll(".xr-theme-switcher select")).toHaveLength(
      0,
    );

    chooseSelectOption("Theme", "dark");

    expect(onThemeChange).toHaveBeenCalledWith("dark");
    expect(setItem).toHaveBeenCalledWith("boilerplate.theme", "dark");
    expect(document.documentElement.dataset["themePreference"]).toBe("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("detects query locale before browser fallback", () => {
    installStorage();
    window.history.replaceState(null, "", "/?lang=ru");
    expect(detectBrowserLocale()).toBe("ru");
  });
});
