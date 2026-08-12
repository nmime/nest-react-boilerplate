import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { supportedLocales } from "@app/common-i18n-runtime";

export const localeCatalogRoot = "i18n";

/**
 * The Nx manifest that sits beside the catalogs of one scope. It is the only JSON inside a scope
 * directory that is not a catalog.
 */
export const localeScopeManifestFileName = "project.json";

/**
 * Locale metadata (an untranslated-review ledger, a per-locale README of conventions) belongs beside
 * the catalogs it describes. Recognising it by SHAPE rather than by an allowlist of names means a
 * product can add one without editing repository tooling: a catalog is always `<scope>/<file>.json`,
 * so anything at the locale root is metadata.
 */
export function isLocaleMetadataFile(relativePath: string): boolean {
  return !relativePath.includes("/");
}

function isCatalogFile(relativePath: string): boolean {
  return (
    relativePath.endsWith(".json") &&
    !isLocaleMetadataFile(relativePath) &&
    !relativePath.endsWith(`/${localeScopeManifestFileName}`)
  );
}

export function localeDirectory(workspaceRoot: string, locale: string): string {
  return join(workspaceRoot, localeCatalogRoot, locale);
}

/**
 * The locale axis. `supportedLocales` stays the single source; the catalog tree is required to agree
 * with it, so a locale can never be half-added (a directory nobody binds, or a binding with no copy).
 */
export function localeAxis(): readonly string[] {
  return supportedLocales;
}

export function discoverLocaleScopes(workspaceRoot: string, locale: string): string[] {
  const directory = localeDirectory(workspaceRoot, locale);
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Every catalog file of one locale as `<scope>/<file>.json`, discovered rather than enumerated so a
 * new namespace is a JSON file rather than an edit to this package.
 *
 * A selector is normally a scope directory, whose catalogs are all discovered. It may instead name a
 * single `<scope>/<file>.json` for a scope several consumers share and split between them — the
 * `bots` scope carries one catalog per bot, and a bot that bound the whole scope would ship the
 * other bot's copy.
 */
export function discoverLocaleCatalogFiles(
  workspaceRoot: string,
  locale: string,
  selectors?: readonly string[],
): string[] {
  const directory = localeDirectory(workspaceRoot, locale);
  const selected = selectors ?? discoverLocaleScopes(workspaceRoot, locale);

  return selected
    .flatMap((selector) => {
      if (isCatalogFile(selector)) {
        return existsSync(join(directory, selector)) ? [selector] : [];
      }

      const scopeDirectory = join(directory, selector);
      if (!existsSync(scopeDirectory) || !statSync(scopeDirectory).isDirectory()) {
        return [];
      }

      return readdirSync(scopeDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => `${selector}/${entry.name}`)
        .filter((relativePath) => isCatalogFile(relativePath));
    })
    .sort((left, right) => left.localeCompare(right));
}

/**
 * The namespace catalog every locale must carry, taken from the default locale. Replaces the
 * hardcoded namespace list that made adding a namespace an edit to repository tooling.
 */
export function discoverCatalogNamespaces(workspaceRoot: string, defaultLocale: string): string[] {
  return discoverLocaleCatalogFiles(workspaceRoot, defaultLocale);
}
