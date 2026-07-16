const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function normalizeStringList(value: unknown): string[] {
  let values: string[] = [];
  if (Array.isArray(value)) {
    values = value.filter(isNonEmptyString);
  } else if (typeof value === 'string') {
    values = value.split(/[\s,]+/u);
  }
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
