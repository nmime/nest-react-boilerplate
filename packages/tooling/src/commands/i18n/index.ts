import { checkLocaleCatalogBindings, writeLocaleCatalogBindings } from "./catalog-bindings.ts";
import { checkTranslationKeyModule, translationKeyModulePath, writeTranslationKeyModule } from "./translation-keys.ts";

export * from "./catalog-bindings.ts";
export * from "./catalog-sources.ts";
export * from "./translation-keys.ts";

export interface I18nGenerateOptions {
  workspaceRoot?: string;
}

export interface I18nGenerateResult {
  readonly changed: readonly string[];
}

/**
 * Regenerates every artifact derived from the locale axis. Adding a locale is then: create
 * `i18n/<locale>/**`, extend `supportedLocales`, rerun this.
 */
export function runI18nGenerate({ workspaceRoot = process.cwd() }: I18nGenerateOptions = {}): I18nGenerateResult {
  const changed = [...writeLocaleCatalogBindings(workspaceRoot)];
  if (writeTranslationKeyModule(workspaceRoot)) {
    changed.push(translationKeyModulePath);
  }

  return { changed };
}

/** The gate half: reports stale generated artifacts without touching the working tree. */
export function runI18nCheck({ workspaceRoot = process.cwd() }: I18nGenerateOptions = {}): string[] {
  return [...checkLocaleCatalogBindings(workspaceRoot), ...checkTranslationKeyModule(workspaceRoot)];
}
