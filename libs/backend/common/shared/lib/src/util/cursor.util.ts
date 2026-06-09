export const encodeCursor = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

export const decodeCursor = (value: string): string =>
  Buffer.from(value, "base64url").toString("utf8");
