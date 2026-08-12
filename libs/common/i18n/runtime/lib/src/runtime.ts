export type RuntimeLocaleCatalog = Record<string, string>;
export type RuntimeLocaleCatalogFileEntry<FileName extends string = string> = readonly [FileName, RuntimeLocaleCatalog];

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export const supportedLocales = ['en', 'ru'] as const;
export type Locale = (typeof supportedLocales)[number];
// eslint-disable-next-line sonarjs/redundant-type-aliases -- Public domain name retained alongside the locale representation.
export type Language = Locale;
export type RuntimeTranslations = Record<Locale, RuntimeLocaleCatalog>;
export const defaultLocale = 'en' satisfies Locale;

/**
 * `Capitalize<'pt-BR'>` is `'Pt-BR'`, which is not a usable member name: consumers would have to
 * write `Language['Pt-BR']`. Collapsing the subtags keeps every key dot-accessible no matter how
 * many locales a product declares.
 */
type PascalCase<Value extends string> = Value extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${PascalCase<Tail>}`
  : Capitalize<Value>;

type LanguageMap = {
  readonly [CurrentLocale in Locale as PascalCase<CurrentLocale>]: CurrentLocale;
};

export function languageKey(locale: string): string {
  return locale
    .split('-')
    .filter(Boolean)
    .map((subtag) => `${subtag.charAt(0).toUpperCase()}${subtag.slice(1)}`)
    .join('');
}

export const Language = Object.freeze(
  Object.fromEntries(supportedLocales.map((locale) => [languageKey(locale), locale])),
) as LanguageMap;

export type Localizations<Value> = Partial<Record<Language | 'default', Value>>;

export interface TranslateOptions {
  locale?: string | null;
  params?: TranslationParams;
  /** Terminal locale of the fallback chain. Defaults to {@link defaultLocale}. */
  fallbackLocale?: string | null;
}

export type LocaleHeaders =
  Record<string, string | string[] | undefined> | { get(name: string): string | null | undefined };

export interface LocaleRequestSource {
  query?: Record<string, unknown>;
  headers?: LocaleHeaders;
  cookies?: Record<string, unknown>;
  language?: string;
  locale?: string;
  url?: string;
  originalUrl?: string;
}

const supportedLocaleSet = new Set<string>(supportedLocales);

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocaleSet.has(value);
}

export const isLanguage = isSupportedLocale;

export function getLocalization<Value>(
  localizations: { readonly [key: string]: Value | undefined } | null | undefined,
  language?: string | null,
): Value | undefined {
  if (!localizations) {
    return undefined;
  }

  // The chain is built from the keys actually present, so a script variant resolves to its sibling
  // script before dropping to the default locale.
  for (const candidate of localeFallbackChain(language, { supported: Object.keys(localizations) })) {
    const value = localizations[candidate];
    if (value !== undefined) {
      return value;
    }
  }

  if (localizations.default !== undefined) {
    return localizations.default;
  }

  for (const supportedLocale of supportedLocales) {
    const fallback = localizations[supportedLocale];
    if (fallback !== undefined) {
      return fallback;
    }
  }

  return undefined;
}

export function mergeLocaleCatalogFiles<FileName extends string>(
  locale: Locale,
  files: readonly RuntimeLocaleCatalogFileEntry<FileName>[],
): RuntimeLocaleCatalog {
  const merged: RuntimeLocaleCatalog = {};

  for (const [fileName, catalog] of files) {
    for (const [key, value] of Object.entries(catalog)) {
      if (Object.hasOwn(merged, key)) {
        throw new Error(`Duplicate i18n key ${key} while merging ${locale}/${fileName}`);
      }

      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Folds a per-locale file registry into one catalog per locale. The registry is generated from the
 * `i18n/` tree, so a locale or a namespace is added by dropping files in rather than by extending a
 * hand-written import list in every binding module.
 */
export function buildLocaleTranslations(
  localeFiles: Readonly<Record<Locale, readonly RuntimeLocaleCatalogFileEntry[]>>,
): RuntimeTranslations {
  return Object.fromEntries(
    Object.entries(localeFiles).map(([locale, files]) => [locale, mergeLocaleCatalogFiles(locale as Locale, files)]),
  ) as RuntimeTranslations;
}

/**
 * Expands a client-supplied tag into the lookup order BCP 47 implies: most specific first, then
 * each shorter prefix. A two-entry list (`full`, `language`) skipped the script subtag entirely,
 * so `uz-Cyrl-UZ` fell straight through to `uz` even when a product declared `uz-Cyrl`.
 */
export function localeCandidates(value: string | null | undefined): string[] {
  const normalized = (value ?? '').trim().toLowerCase().replaceAll('_', '-');
  const subtags = normalized.split('-').filter(Boolean);
  return subtags.map((_, index) => subtags.slice(0, subtags.length - index).join('-'));
}

/**
 * The matching half of locale resolution, kept generic over the supported set so a product can
 * resolve against its own locales — and so the behavior is testable independently of whichever
 * locales this workspace happens to ship.
 */
function declaredLocaleLookup<SupportedLocale extends string>(
  supported: readonly SupportedLocale[],
): Map<string, SupportedLocale> {
  const declaredByLookupKey = new Map<string, SupportedLocale>();
  for (const locale of supported) {
    const lookupKey = locale.toLowerCase();
    if (!declaredByLookupKey.has(lookupKey)) {
      declaredByLookupKey.set(lookupKey, locale);
    }
  }

  return declaredByLookupKey;
}

export interface LocaleFallbackOptions {
  /** Locales that actually have content. Defaults to {@link supportedLocales}. */
  supported?: readonly string[];
  /** Terminal locale, appended even when it is not in `supported`. Defaults to {@link defaultLocale}. */
  fallbackLocale?: string | null;
  /**
   * Relations subtag truncation cannot express — `be -> ru`, `nb -> no`. Keyed by the declared
   * locale, values are tried in order after the truncation ladder.
   */
  overrides?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The ordered lookup path for one locale. Falling straight to `defaultLocale` served English to a
 * `uz-Cyrl` reader whose `uz` sibling had the string; the ladder puts every declared prefix of the
 * requested tag ahead of the terminal fallback.
 */
export function localeFallbackChain(
  locale: string | null | undefined,
  { supported = supportedLocales, fallbackLocale = defaultLocale, overrides = {} }: LocaleFallbackOptions = {},
): string[] {
  const declared = declaredLocaleLookup(supported);
  const related = declaredLocaleLookup(Object.keys(overrides));
  const chain: string[] = [];
  const append = (value: string | undefined): void => {
    if (value !== undefined && !chain.includes(value)) {
      chain.push(value);
    }
  };

  for (const candidate of localeCandidates(locale)) {
    append(declared.get(candidate));
  }

  const best = chain[0];
  if (best !== undefined) {
    for (const relative of overrides[related.get(best.toLowerCase()) ?? ''] ?? []) {
      append(declared.get(relative.toLowerCase()));
    }
  }

  if (fallbackLocale) {
    append(declared.get(fallbackLocale.toLowerCase()) ?? fallbackLocale);
  }

  return chain;
}

/**
 * Canonical BCP 47 casing for a locale id the workspace stores lowercase (`uz-cyrl` -> `uz-Cyrl`).
 * Everything that leaves the process — `<html lang>`, `Content-Language`, `Intl` constructors,
 * third-party locale vocabularies — wants the canonical spelling.
 */
export function toBcp47(locale: string): string {
  return locale
    .trim()
    .replaceAll('_', '-')
    .split('-')
    .filter(Boolean)
    .map((subtag, index) => {
      if (index === 0) {
        return subtag.toLowerCase();
      }

      if (subtag.length === 4) {
        return `${subtag.charAt(0).toUpperCase()}${subtag.slice(1).toLowerCase()}`;
      }

      return subtag.length === 2 || /^\d{3}$/u.test(subtag) ? subtag.toUpperCase() : subtag.toLowerCase();
    })
    .join('-');
}

/**
 * The locale's name as `Intl` renders it, defaulting to the endonym. Returns undefined when the
 * runtime has no display data (trimmed ICU builds such as Hermes) or does not know the tag, so
 * callers can fall back rather than render the raw id.
 */
export function localeDisplayName(locale: string, displayLocale: string = locale): string | undefined {
  const tag = toBcp47(locale);

  try {
    // `fallback: 'none'` makes an unknown tag return undefined instead of a cosmetic `zz (Qqqq)`.
    return new Intl.DisplayNames([toBcp47(displayLocale)], { fallback: 'none', type: 'language' }).of(tag);
  } catch {
    return undefined;
  }
}

export interface LocaleLabelOptions {
  /** Language the label is rendered in. Defaults to the locale itself (its endonym). */
  displayLocale?: string;
  /** Product wording that should win over the ICU name, typically a `common.language.*` entry. */
  override?: string | null;
}

/**
 * Switcher label for a locale. Deriving it removes the N x N `common.language.<locale>` grid every
 * locale addition otherwise forces into every existing catalog.
 */
export function localeLabel(locale: string, { displayLocale = locale, override }: LocaleLabelOptions = {}): string {
  return override ?? localeDisplayName(locale, displayLocale) ?? toBcp47(locale);
}

export function matchLocale<SupportedLocale extends string>(
  value: string | null | undefined,
  supported: readonly SupportedLocale[],
): SupportedLocale | undefined {
  const declaredByLookupKey = declaredLocaleLookup(supported);

  for (const candidate of localeCandidates(value)) {
    const matched = declaredByLookupKey.get(candidate);
    if (matched !== undefined) {
      return matched;
    }
  }

  return undefined;
}

export function normalizeLocale(value: string | null | undefined): Locale | undefined {
  return matchLocale(value, supportedLocales);
}

export function parseAcceptLanguage(value: string | null | undefined): Locale | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(',')
    .map((part, order) => {
      const [localePart, ...parameters] = part.trim().split(';');
      const qualityParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => /^q=/iu.test(parameter));
      const quality = qualityParameter ? Number(qualityParameter.slice(2)) : 1;
      return {
        locale: normalizeLocale(localePart),
        order,
        quality,
      };
    })
    .filter(
      (entry): entry is { locale: Locale; order: number; quality: number } =>
        Boolean(entry.locale) && Number.isFinite(entry.quality) && entry.quality > 0 && entry.quality <= 1,
    )
    .sort((left, right) => right.quality - left.quality || left.order - right.order)[0]?.locale;
}

export function resolveLocale(...values: Array<string | null | undefined>): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value) ?? parseAcceptLanguage(value);
    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

function headerValue(headers: LocaleHeaders | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  const normalizedName = name.toLowerCase();
  const headerRecord = headers as Record<string, string | string[] | undefined>;
  const entry = Object.entries(headerRecord).find(([headerName]) => headerName.toLowerCase() === normalizedName);
  const value = entry?.[1];
  return Array.isArray(value) ? value.join(',') : value;
}

export function resolveLocaleFromHeaders(headers: LocaleHeaders | undefined): Locale {
  return resolveLocale(
    headerValue(headers, 'x-locale'),
    headerValue(headers, 'x-language'),
    headerValue(headers, 'accept-language'),
  );
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === 'string' ? value : undefined;
}

function localeFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, 'http://localhost');
    return parsed.searchParams.get('lang') ?? parsed.searchParams.get('locale') ?? undefined;
  } catch {
    return undefined;
  }
}

function firstCookieValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
  return resolveLocale(
    firstQueryValue(source.query?.lang),
    firstQueryValue(source.query?.locale),
    localeFromUrl(source.originalUrl ?? source.url),
    headerValue(source.headers, 'x-locale'),
    headerValue(source.headers, 'x-language'),
    firstCookieValue(source.cookies?.locale),
    firstCookieValue(source.cookies?.lang),
    source.locale,
    source.language,
    headerValue(source.headers, 'accept-language'),
  );
}

export const resolveLanguage = resolveLocale;
export const resolveLanguageFromHeaders = resolveLocaleFromHeaders;
export const resolveLanguageFromRequest = resolveLocaleFromRequest;

export function hasTranslationKeyIn<Key extends string>(
  translations: Record<Locale, Partial<Record<Key, string>>>,
  key: string,
): key is Key {
  return Object.hasOwn(getLocalization(translations, defaultLocale) ?? {}, key);
}

interface BalancedBlock {
  readonly body: string;
  readonly closed: boolean;
  readonly end: number;
}

function readBalancedBlock(message: string, start: number): BalancedBlock {
  let depth = 0;

  for (let index = start; index < message.length; index += 1) {
    const character = message[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return { body: message.slice(start + 1, index), closed: true, end: index + 1 };
      }
    }
  }

  return { body: message.slice(start + 1), closed: false, end: message.length };
}

/**
 * Splits `one {…} other {…}` into its branches. The source always comes from a balanced block, so a
 * branch is guaranteed to close; only trailing text that is not a branch makes the argument invalid.
 */
function parseArgumentBranches(source: string): Map<string, string> | undefined {
  const branches = new Map<string, string>();
  let cursor = 0;

  while (cursor < source.length) {
    const header = /^\s*(?:=\d+|\w+)\s*(?=\{)/u.exec(source.slice(cursor));
    if (!header) {
      return source.slice(cursor).trim().length === 0 ? branches : undefined;
    }

    const block = readBalancedBlock(source, cursor + header[0].length);
    branches.set(header[0].trim(), block.body);
    cursor = block.end;
  }

  return branches;
}

function pluralCategory(count: number, locale: string, type: 'cardinal' | 'ordinal'): string {
  try {
    return new Intl.PluralRules(toBcp47(locale), { type }).select(count);
  } catch {
    return 'other';
  }
}

const argumentKinds = new Set(['plural', 'select', 'selectordinal']);
const argumentNamePattern = /^[\w.-]+$/u;

interface MessageArgument {
  readonly branches: Map<string, string>;
  readonly kind: string;
  readonly name: string;
  readonly other: string;
}

function parseMessageArgument(body: string): MessageArgument | undefined {
  const nameEnd = body.indexOf(',');
  const kindEnd = body.indexOf(',', nameEnd + 1);
  if (nameEnd < 0 || kindEnd < 0) {
    return undefined;
  }

  const name = body.slice(0, nameEnd).trim();
  const kind = body.slice(nameEnd + 1, kindEnd).trim();
  if (!argumentNamePattern.test(name) || !argumentKinds.has(kind)) {
    return undefined;
  }

  const branches = parseArgumentBranches(body.slice(kindEnd + 1));
  const other = branches?.get('other');
  return branches && other !== undefined ? { branches, kind, name, other } : undefined;
}

/**
 * The branch an argument's value selects, and the number `#` stands for inside it.
 *
 * `count` is undefined whenever no number was in play — a `select` argument, or a plural whose
 * value is not finite — because `#` then has nothing to name and must be left as written.
 */
function selectMessageBranch(
  argument: MessageArgument,
  value: TranslationParams[string],
  locale: string,
): { branch: string; count: number | undefined } {
  if (argument.kind === 'select') {
    return { branch: argument.branches.get(String(value ?? '')) ?? argument.other, count: undefined };
  }

  const count = Number(value);

  if (!Number.isFinite(count)) {
    return { branch: argument.other, count: undefined };
  }

  const category = pluralCategory(count, locale, argument.kind === 'selectordinal' ? 'ordinal' : 'cardinal');

  return { branch: argument.branches.get(`=${count}`) ?? argument.branches.get(category) ?? argument.other, count };
}

/**
 * Expands the ICU subset the catalogs are allowed to carry: `plural`, `selectordinal` and `select`.
 * Plural categories come from `Intl.PluralRules`, so Russian's `one/few/many/other` works without any
 * per-locale code. Anything that does not parse — an unknown argument type, a missing `other` branch,
 * an unbalanced brace — is left verbatim rather than swallowed, so a malformed message stays visible.
 */
function expandMessageArguments(message: string, params: TranslationParams, locale: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < message.length) {
    const open = message.indexOf('{', cursor);
    if (open < 0) {
      result += message.slice(cursor);
      break;
    }

    // `{{name}}` belongs to the interpolation pass; step over both braces so its inner brace is not
    // mistaken for the start of an argument.
    if (message[open + 1] === '{') {
      result += message.slice(cursor, open + 2);
      cursor = open + 2;
      continue;
    }

    const block = readBalancedBlock(message, open);
    const argument = block.closed ? parseMessageArgument(block.body) : undefined;
    if (!argument) {
      result += message.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    const { branch, count } = selectMessageBranch(argument, params[argument.name], locale);

    result += expandMessageArguments(
      count === undefined ? branch : branch.replaceAll('#', String(count)),
      params,
      locale,
    );
    cursor = block.end;
  }

  return result;
}

export function interpolate(message: string, params: TranslationParams = {}, locale: string = defaultLocale): string {
  return expandMessageArguments(message, params, locale).replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translateFromCatalog<Key extends string>(
  translations: Record<Locale, Partial<Record<Key, string>>>,
  key: Key,
  { locale = defaultLocale, params = {}, fallbackLocale = defaultLocale }: TranslateOptions = {},
): string {
  const catalogs: Record<string, Partial<Record<Key, string>> | undefined> = translations;
  const chain = localeFallbackChain(locale, { supported: Object.keys(translations), fallbackLocale });

  for (const candidate of chain) {
    const message = catalogs[candidate]?.[key];
    if (message !== undefined) {
      return interpolate(message, params, candidate);
    }
  }

  return interpolate(key, params, chain[0] ?? defaultLocale);
}
