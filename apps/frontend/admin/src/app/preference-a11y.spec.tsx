import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./app";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  window.history.replaceState(null, "", "/profile?token=admin-a11y-token");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("admin preference controls accessibility", () => {
  it("keeps language and theme selectors discoverable by accessible names", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          data: {
            principal: {
              permissions: ["admin:profile:read", "admin:dashboard:read"],
              roles: ["admin"],
              subject: "admin-id",
            },
            profile: {
              email: "admin@example.com",
              id: "admin-id",
              permissions: ["admin:profile:read", "admin:dashboard:read"],
              roles: ["admin"],
            },
            user: { locale: "en", theme: "system" },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    render(<App />);

    expect(await screen.findByText("admin@example.com")).toBeTruthy();

    const languageSelect = screen.getByRole("combobox", { name: "Language" });
    const themeSelect = screen.getByRole("combobox", { name: "Theme" });

    expect(languageSelect).toBe(screen.getByLabelText("Language"));
    expect(themeSelect).toBe(screen.getByLabelText("Theme"));
    expect(languageSelect).toHaveProperty("value", "en");
    expect(themeSelect).toHaveProperty("value", "system");
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Dark" })).toBeTruthy();
  });
});
