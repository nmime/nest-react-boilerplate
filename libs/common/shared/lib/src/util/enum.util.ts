export const enumValues = <T extends Record<string, string | number>>(
  value: T,
): T[keyof T][] => Object.values(value) as T[keyof T][];
