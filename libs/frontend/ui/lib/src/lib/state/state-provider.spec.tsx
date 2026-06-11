import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FrontendI18nProvider,
  LanguageSwitcher,
  useI18n,
} from "../i18n/i18n-provider";
import { FrontendStateProvider, createRootStore, useRootStore } from "./index";

const LocalePreview = observer(function LocalePreview() {
  const { locale } = useI18n();
  const { ui } = useRootStore();

  return (
    <div>
      <span>{locale}</span>
      <button onClick={() => ui.toggleSidebar()} type="button">
        {ui.sidebarOpen ? "open" : "closed"}
      </button>
    </div>
  );
});

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

describe("frontend MobX state foundation", () => {
  afterEach(() => {
    cleanup();
    document.cookie = "locale=; path=/; max-age=0";
  });

  it("drives i18n locale from the shared LocaleStore", () => {
    const store = createRootStore({ initialLocale: "en" });
    render(
      <FrontendStateProvider store={store}>
        <FrontendI18nProvider>
          <LanguageSwitcher />
          <LocalePreview />
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    expect(screen.getByText("en")).toBeTruthy();

    chooseSelectOption("Language", "ru");

    expect(screen.getByText("ru")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("keeps client-only shell state in MobX without server cache data", () => {
    const store = createRootStore({ initialTheme: "dark" });
    store.authShell.setBearerToken(" shell-token ");
    store.ui.openModal("profile-menu");
    store.ui.toggleSidebar();

    expect(store.authShell.isAuthenticated).toBe(true);
    expect(store.authShell.bearerToken).toBe("shell-token");
    expect(store.ui.activeModal).toBe("profile-menu");
    expect(store.ui.sidebarOpen).toBe(false);
    expect(store.ui.theme).toBe("dark");
  });
});
