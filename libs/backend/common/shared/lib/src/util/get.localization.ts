import type { LocalizedField } from "../type";

export const getLocalization = <T>(
  field: LocalizedField<T>,
  locale: string,
  fallback = "en",
): T | undefined => field[locale] ?? field[fallback] ?? Object.values(field)[0];
