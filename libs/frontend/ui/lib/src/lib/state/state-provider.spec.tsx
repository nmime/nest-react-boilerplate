import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api/api-client";
import {
  FrontendI18nProvider,
  LanguageSwitcher,
  useI18n,
} from "../i18n/i18n-provider";
import { FrontendStateProvider, createRootStore, useRootStore } from "./index";

const jsonResponse = (body: unknown): Response =>
  ({
    headers: new Headers({ "content-type": "application/json" }),
    json: vi.fn().mockResolvedValue(body),
    ok: true,
    status: 200,
  }) as unknown as Response;

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

describe("frontend MobX state foundation", () => {
  afterEach(() => {
    cleanup();
    document.cookie = "locale=; path=/; max-age=0";
  });

  it("drives i18n and apiFetch locale from the shared LocaleStore", async () => {
    const store = createRootStore({ initialLocale: "en" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { ok: true } }));

    render(
      <FrontendStateProvider store={store}>
        <FrontendI18nProvider>
          <LanguageSwitcher />
          <LocalePreview />
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    expect(screen.getByText("en")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "ru" },
    });

    expect(screen.getByText("ru")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ru");
    await apiFetch("/localized", { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Accept-Language": "ru",
    });
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
