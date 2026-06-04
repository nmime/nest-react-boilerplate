import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function openSelect(label: string) {
  const trigger = screen.getByRole("combobox", { name: label });

  installRadixPointerMocks();
  trigger.focus();
  expect(document.activeElement).toBe(trigger);
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });

  return trigger;
}

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
    expect(document.querySelectorAll("header select")).toHaveLength(0);
    expect(document.querySelector("header .xr-select-native")).toBeNull();
    expect(languageSelect.tagName.toLowerCase()).toBe("button");
    expect(themeSelect.tagName.toLowerCase()).toBe("button");
    expect(languageSelect.getAttribute("aria-hidden")).toBeNull();
    expect(themeSelect.getAttribute("aria-hidden")).toBeNull();
    expect(languageSelect.getAttribute("tabindex")).not.toBe("-1");
    expect(themeSelect.getAttribute("tabindex")).not.toBe("-1");
    expect(languageSelect.textContent).toContain("English");
    expect(themeSelect.textContent).toContain("System");

    openSelect("Language");
    fireEvent.click(screen.getByRole("option", { name: "English" }));
    openSelect("Theme");
    expect(screen.getByRole("option", { name: "Dark" })).toBeTruthy();
  });
});
