import type { Locale } from "../i18n/locale";
import { AppStore } from "./app-store";
import { AuthShellStore } from "./auth-shell-store";
import { LocaleStore } from "./locale-store";
import { UiStore, type UiTheme } from "./ui-store";

export interface RootStoreOptions {
  initialBearerToken?: string | null;
  initialLocale?: Locale | null;
  initialTheme?: UiTheme | null;
}

export class RootStore {
  readonly app: AppStore;
  readonly authShell: AuthShellStore;
  readonly locale: LocaleStore;
  readonly ui: UiStore;

  constructor(options: RootStoreOptions = {}) {
    this.app = new AppStore();
    this.locale = new LocaleStore(options.initialLocale);
    this.authShell = new AuthShellStore(options.initialBearerToken);
    this.ui = new UiStore(options.initialTheme);
  }

  dispose(): void {
    this.app.dispose();
  }
}

export const createRootStore = (options?: RootStoreOptions): RootStore =>
  new RootStore(options);
