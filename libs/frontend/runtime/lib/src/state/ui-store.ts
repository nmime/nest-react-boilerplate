/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { makeAutoObservable } from "mobx";

export type UiTheme = "light" | "dark" | "system";
export type ResolvedUiTheme = "light" | "dark";
export const ThemeStorageKey = "boilerplate.theme";

const SystemThemeMediaQuery = "(prefers-color-scheme: dark)";
const LegacyAddListener = "addListener";
const LegacyRemoveListener = "removeListener";

type LegacyMediaQueryList = MediaQueryList & {
  [LegacyAddListener]?: (
    listener: (event: MediaQueryListEvent) => void,
  ) => void;
  [LegacyRemoveListener]?: (
    listener: (event: MediaQueryListEvent) => void,
  ) => void;
};

function normalizeTheme(value: string | null | undefined): UiTheme | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "light" ||
    normalized === "dark" ||
    normalized === "system"
    ? normalized
    : undefined;
}

function readStoredTheme(): UiTheme | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return normalizeTheme(window.localStorage?.getItem(ThemeStorageKey));
  } catch {
    return undefined;
  }
}

function persistTheme(theme: UiTheme): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(ThemeStorageKey, theme);
  } catch {
    // Ignore storage failures in private browsing or SSR shims.
  }
}

function resolveSystemTheme(): ResolvedUiTheme {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }

  return window.matchMedia(SystemThemeMediaQuery).matches ? "dark" : "light";
}

export function resolveTheme(theme: UiTheme): ResolvedUiTheme {
  return theme === "system" ? resolveSystemTheme() : theme;
}

function applyThemeToDocument(theme: UiTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.dataset["themePreference"] = theme;
  root.dataset["theme"] = resolveTheme(theme);
}

function addMediaQueryChangeListener(
  mediaQueryList: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): void {
  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return;
  }

  const legacyMediaQueryList = mediaQueryList as LegacyMediaQueryList;
  const addListener = legacyMediaQueryList[LegacyAddListener];
  if (typeof addListener === "function") {
    addListener.call(mediaQueryList, listener);
  }
}

function removeMediaQueryChangeListener(
  mediaQueryList: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
): void {
  if (typeof mediaQueryList.removeEventListener === "function") {
    mediaQueryList.removeEventListener("change", listener);
    return;
  }

  const legacyMediaQueryList = mediaQueryList as LegacyMediaQueryList;
  const removeListener = legacyMediaQueryList[LegacyRemoveListener];
  if (typeof removeListener === "function") {
    removeListener.call(mediaQueryList, listener);
  }
}

export class UiStore {
  activeModal: string | null = null;
  sidebarOpen = true;
  theme: UiTheme;
  resolvedTheme: ResolvedUiTheme;
  private mediaQueryListener?: (event: MediaQueryListEvent) => void;
  private mediaQueryList?: MediaQueryList;

  constructor(initialTheme?: UiTheme | null) {
    this.theme = initialTheme ?? readStoredTheme() ?? "system";
    this.resolvedTheme = resolveTheme(this.theme);
    makeAutoObservable(this, {}, { autoBind: true });
    this.applyTheme();
    this.syncSystemThemeSubscription();
  }

  setTheme(theme: UiTheme): void {
    this.theme = theme;
    persistTheme(theme);
    this.applyTheme();
    this.syncSystemThemeSubscription();
  }

  applyUserTheme(theme?: UiTheme | null): void {
    if (!theme) {
      return;
    }

    this.setTheme(theme);
  }

  private applyTheme(): void {
    this.resolvedTheme = resolveTheme(this.theme);
    applyThemeToDocument(this.theme);
  }

  private syncSystemThemeSubscription(): void {
    this.removeSystemThemeSubscription();

    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      this.theme !== "system"
    ) {
      return;
    }

    const mediaQueryList = window.matchMedia(SystemThemeMediaQuery);
    this.mediaQueryList = mediaQueryList;
    this.mediaQueryListener = (event: MediaQueryListEvent) => {
      if (this.theme !== "system") {
        return;
      }
      this.resolvedTheme = event.matches ? "dark" : "light";
      applyThemeToDocument(this.theme);
    };
    addMediaQueryChangeListener(mediaQueryList, this.mediaQueryListener);
  }

  private removeSystemThemeSubscription(): void {
    if (this.mediaQueryList && this.mediaQueryListener) {
      removeMediaQueryChangeListener(
        this.mediaQueryList,
        this.mediaQueryListener,
      );
    }
    this.mediaQueryList = undefined;
    this.mediaQueryListener = undefined;
  }

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  openModal(modalId: string): void {
    this.activeModal = modalId;
  }

  closeModal(): void {
    this.activeModal = null;
  }
}
