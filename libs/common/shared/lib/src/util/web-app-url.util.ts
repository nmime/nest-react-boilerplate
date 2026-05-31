export const buildWebAppUrl = (
  baseUrl: string,
  path = "",
  query: Record<string, string> = {},
): string => {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};
