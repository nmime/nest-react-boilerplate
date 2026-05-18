import { makeAutoObservable } from "mobx";

export type UiTheme = "light" | "dark" | "system";
export type ResolvedUiTheme = "light" | "dark";
export const ThemeStorageKey = "boilerplate.theme";

const SystemThemeMediaQuery = "(prefers-color-scheme: dark)";

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

export class UiStore {
  activeModal: string | null = null;
  sidebarOpen = true;
  theme: UiTheme;
  resolvedTheme: ResolvedUiTheme;
  private mediaQueryListener?: (event: MediaQueryListEvent) => void;

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
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQueryList = window.matchMedia(SystemThemeMediaQuery);
    if (this.mediaQueryListener) {
      mediaQueryList.removeEventListener("change", this.mediaQueryListener);
    }

    this.mediaQueryListener = (event: MediaQueryListEvent) => {
      if (this.theme !== "system") {
        return;
      }
      this.resolvedTheme = event.matches ? "dark" : "light";
      applyThemeToDocument(this.theme);
    };

    if (this.theme !== "system") {
      return;
    }
    mediaQueryList.addEventListener("change", this.mediaQueryListener);
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
