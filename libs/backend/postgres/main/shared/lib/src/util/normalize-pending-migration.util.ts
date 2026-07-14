import type { PostgresPendingMigration } from '../type';

export function normalizePendingMigration(migration: unknown): PostgresPendingMigration {
  if (typeof migration === 'string') {
    return { name: migration };
  }

  if (!migration || typeof migration !== 'object') {
    return {};
  }

  const record = migration as Record<string, unknown>;
  const name = firstString(record.name, record.file, record.path, record.migration);

  return name ? { name } : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string');
}
