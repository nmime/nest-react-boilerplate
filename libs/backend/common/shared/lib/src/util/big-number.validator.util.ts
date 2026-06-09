export const isBigNumberLike = (value: unknown): boolean =>
  typeof value === "number" ||
  typeof value === "bigint" ||
  typeof value === "string";
