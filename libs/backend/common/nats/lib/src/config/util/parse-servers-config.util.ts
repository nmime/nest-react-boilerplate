export function parseServersConfig(value: string): string[] {
  if (value === "") {
    return [];
  }

  return value
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);
}
