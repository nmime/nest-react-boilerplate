export function createIsEnum<T extends Record<string, string | number>>(
  enumObj: T,
): (value: unknown) => value is T[keyof T] {
  const values = new Set<unknown>(Object.values(enumObj));
  return (value: unknown): value is T[keyof T] => values.has(value);
}
