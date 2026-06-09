export function mapByKey<T, K extends PropertyKey>(
  values: readonly T[],
  getKey: (value: T) => K,
): Map<K, T> {
  return new Map(values.map((value) => [getKey(value), value]));
}

export function groupByKey<T, K extends PropertyKey>(
  values: readonly T[],
  getKey: (value: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const items = grouped.get(key) ?? [];
    items.push(value);
    grouped.set(key, items);
  }

  return grouped;
}
