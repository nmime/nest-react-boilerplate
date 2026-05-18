import type { Locale } from "@app/common/i18n";
import { AuthShellStore } from "./auth-shell-store";
import { LocaleStore } from "./locale-store";
import { UiStore } from "./ui-store";

export interface RootStoreOptions {
  initialBearerToken?: string | null;
  initialLocale?: Locale | null;
}

export class RootStore {
  readonly authShell: AuthShellStore;
  readonly locale: LocaleStore;
  readonly ui: UiStore;

  constructor(options: RootStoreOptions = {}) {
    this.locale = new LocaleStore(options.initialLocale);
    this.authShell = new AuthShellStore(options.initialBearerToken);
    this.ui = new UiStore();
  }
}

export const createRootStore = (options?: RootStoreOptions): RootStore =>
  new RootStore(options);
