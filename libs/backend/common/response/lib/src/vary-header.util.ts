export const ProblemDetailsVaryHeaders = ['Accept-Language', 'X-Locale', 'X-Language', 'Cookie'] as const;

function headerParts(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => (typeof item === 'string' ? item.split(',') : [])).map((item) => item.trim());
}

export function mergeVaryHeader(
  currentValue: unknown,
  requiredHeaders: readonly string[] = ProblemDetailsVaryHeaders,
): string {
  const existing = headerParts(currentValue).filter(Boolean);
  if (existing.includes('*')) {
    return '*';
  }

  const seen = new Set(existing.map((header) => header.toLowerCase()));
  for (const header of requiredHeaders) {
    const normalized = header.toLowerCase();
    if (!seen.has(normalized)) {
      existing.push(header);
      seen.add(normalized);
    }
  }

  return existing.join(', ');
}
