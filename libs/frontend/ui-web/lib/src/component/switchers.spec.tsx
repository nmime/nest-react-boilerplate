import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrontendI18nProvider } from "@app/frontend-runtime";
import { LanguageSwitcher, ThemeSwitcher } from "./switchers";

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

  if (!optionElement) {
    throw new Error(`Missing ${option} option.`);
  }

  fireEvent.click(optionElement);
}

describe("frontend UI-web locale and theme switchers", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
  });

  it("renders localized switcher labels from the runtime provider", () => {
    const html = renderToStaticMarkup(
      <FrontendI18nProvider initialLocale="ru">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </FrontendI18nProvider>,
    );

    expect(html).toContain("Язык");
    expect(html).toContain("Тема");
    expect(html).toContain("Русский");
  });

  it("persists explicit language switches through runtime callbacks", () => {
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

  it("persists explicit theme switches through runtime callbacks", () => {
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
});
