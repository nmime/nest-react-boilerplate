import { randomInt } from "node:crypto";

export type LocalizedText = string | Record<string, string | undefined>;

export function resolveLocalizedText(
  value: LocalizedText,
  locale: string,
  fallbackLocale = "en",
): string {
  if (typeof value === "string") {
    return value;
  }

  return (
    value[locale] ??
    value[fallbackLocale] ??
    Object.values(value).find(Boolean) ??
    ""
  );
}

export function randomLocalizedText(
  values: readonly LocalizedText[],
  locale: string,
  fallbackLocale = "en",
): string {
  if (!values.length) {
    return "";
  }

  const index = randomInt(values.length);
  const value = values[index];
  if (value === undefined) {
    return "";
  }

  return resolveLocalizedText(value, locale, fallbackLocale);
}

export const randomIntlText = randomLocalizedText;
