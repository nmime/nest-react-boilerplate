import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeStorageKey, UiStore } from "./ui-store";

interface MatchMediaMock {
  listeners: Array<(event: MediaQueryListEvent) => void>;
  matchMedia: (query: string) => MediaQueryList;
  setMatches: (matches: boolean) => void;
}

function createMatchMediaMock(initialMatches: boolean): MatchMediaMock {
  let matches = initialMatches;
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  return {
    listeners,
    matchMedia: (query: string) =>
      ({
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          listeners.push(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        },
        matches,
        media: query,
        removeEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      }) as unknown as MediaQueryList,
    setMatches: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

describe("UiStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.dataset["theme"] = "";
    document.documentElement.dataset["themePreference"] = "";
  });

  it("falls back from stale stored theme values and applies DOM attributes", () => {
    const setItem = vi.fn();
    const matchMediaMock = createMatchMediaMock(false);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock.matchMedia,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => "sepia"),
        setItem,
      },
    });

    const store = new UiStore();

    expect(store.theme).toBe("system");
    expect(store.resolvedTheme).toBe("light");
    expect(document.documentElement.dataset["themePreference"]).toBe("system");
    expect(document.documentElement.dataset["theme"]).toBe("light");

    store.setTheme("dark");
    expect(setItem).toHaveBeenCalledWith(ThemeStorageKey, "dark");
    expect(document.documentElement.dataset["themePreference"]).toBe("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("updates resolved theme when the system media query changes", () => {
    const matchMediaMock = createMatchMediaMock(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock.matchMedia,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => "system"),
        setItem: vi.fn(),
      },
    });

    const store = new UiStore();
    expect(store.resolvedTheme).toBe("dark");

    matchMediaMock.setMatches(false);

    expect(store.resolvedTheme).toBe("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(document.documentElement.dataset["themePreference"]).toBe("system");
  });

  it("handles storage failures without throwing", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage blocked");
      },
    });

    expect(() => new UiStore()).not.toThrow();
  });
});
