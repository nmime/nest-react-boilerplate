import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeStorageKey, UiStore } from "./ui-store";

interface MatchMediaMockInstance {
  listeners: Array<(event: MediaQueryListEvent) => void>;
  matches: boolean;
  media: string;
  removeCalls: number;
  setMatches: (matches: boolean) => void;
}

interface MatchMediaMock {
  instances: MatchMediaMockInstance[];
  matchMedia: (query: string) => MediaQueryList;
  setMatches: (matches: boolean) => void;
}

function createMatchMediaMock(
  initialMatches: boolean,
  options: { legacyOnly?: boolean } = {},
): MatchMediaMock {
  let matches = initialMatches;
  const instances: MatchMediaMockInstance[] = [];

  const notify = (instance: MatchMediaMockInstance, nextMatches: boolean) => {
    const event = { matches: nextMatches } as MediaQueryListEvent;
    for (const listener of [...instance.listeners]) {
      listener(event);
    }
  };

  return {
    instances,
    matchMedia: (query: string) => {
      const instance: MatchMediaMockInstance = {
        listeners: [],
        matches,
        media: query,
        removeCalls: 0,
        setMatches: (nextMatches: boolean) => {
          matches = nextMatches;
          instance.matches = nextMatches;
          notify(instance, nextMatches);
        },
      };
      instances.push(instance);

      const addListener = (listener: (event: MediaQueryListEvent) => void) => {
        instance.listeners.push(listener);
      };
      const removeListener = (
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        instance.removeCalls += 1;
        const index = instance.listeners.indexOf(listener);
        if (index >= 0) {
          instance.listeners.splice(index, 1);
        }
      };
      const mediaQueryList = {
        addListener,
        get matches() {
          return instance.matches;
        },
        media: query,
        onchange: null,
        removeListener,
      } as Record<string, unknown>;

      if (!options.legacyOnly) {
        mediaQueryList["addEventListener"] = (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => addListener(listener);
        mediaQueryList["removeEventListener"] = (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => removeListener(listener);
      }

      return mediaQueryList as unknown as MediaQueryList;
    },
    setMatches: (nextMatches: boolean) => {
      matches = nextMatches;
      for (const instance of instances) {
        instance.matches = nextMatches;
        notify(instance, nextMatches);
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

  it("removes the active system theme listener before changing subscriptions", () => {
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
    const firstSubscription = matchMediaMock.instances.find(
      (instance) => instance.listeners.length === 1,
    );
    expect(firstSubscription).toBeDefined();

    store.setTheme("dark");

    expect(firstSubscription?.listeners).toHaveLength(0);
    expect(firstSubscription?.removeCalls).toBe(1);

    store.setTheme("system");

    const activeSubscriptions = matchMediaMock.instances.filter(
      (instance) => instance.listeners.length === 1,
    );
    const nextSubscription = activeSubscriptions[activeSubscriptions.length - 1];
    expect(nextSubscription).toBeDefined();
    expect(nextSubscription).not.toBe(firstSubscription);

    nextSubscription?.setMatches(false);

    expect(store.resolvedTheme).toBe("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("falls back to legacy media query listener APIs", () => {
    const matchMediaMock = createMatchMediaMock(false, { legacyOnly: true });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMediaMock.matchMedia,
    });

    const store = new UiStore("system");
    const subscription = matchMediaMock.instances.find(
      (instance) => instance.listeners.length === 1,
    );

    expect(subscription).toBeDefined();

    matchMediaMock.setMatches(true);

    expect(store.resolvedTheme).toBe("dark");

    store.setTheme("light");

    expect(subscription?.listeners).toHaveLength(0);
    expect(subscription?.removeCalls).toBe(1);
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
