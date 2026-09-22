import {
  canonicalIndexName,
  exceedsIdentifierLimit,
  postgresIdentifierMaxBytes,
} from "./migration-index-name.ts";

function normalizeSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unquote(identifier: string): string {
  return identifier.replace(/^"|"$/g, "");
}

function columnsFromName(name: string): string {
  return name
    .split(",")
    .map((part) =>
      unquote(part.trim())
        .replace(/\W+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_");
}

/**
 * A nullable `ADD COLUMN` is the only form PostgreSQL accepts on a populated table, so the safe
 * online pattern is add nullable -> backfill -> `set not null` inside the same migration. The
 * standards gate rejects a column the migration *leaves* nullable, which is why the statements are
 * matched together instead of judging the `ADD COLUMN` in isolation.
 */
function convergesToNotNull(sql: string, table: string, column: string): boolean {
  const tablePattern = new RegExp(`alter\\s+table\\s+"?${table}"?(?=\\s|$)`, "i");
  const columnPattern = new RegExp(`alter\\s+column\\s+"?${column}"?\\s+set\\s+not\\s+null\\b`, "i");
  return normalizeSql(sql)
    .split(";")
    .some((statement) => tablePattern.test(statement.trim()) && columnPattern.test(statement));
}

/** Collects every database migration standard violation in one migration's SQL source. */
export function collectMigrationStandardErrors(sql: string): string[] {
  const errors: string[] = [];
  const normalized = normalizeSql(sql).toLowerCase();
  if (/\bcreate\s+type\b[\s\S]*\bas\s+enum\b/.test(normalized) || /\benum\s*\(/.test(normalized)) {
    errors.push("PostgreSQL ENUM types are not allowed; use VARCHAR plus a CHECK constraint.");
  }
  for (const match of sql.matchAll(
    /alter\s+table\s+"?([a-zA-Z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_]+"?\s+[^;]+);/gi,
  )) {
    if (/\bnot\s+null\b/i.test(match[2])) continue;
    const table = unquote(match[1]);
    const column = unquote(match[2].trim().split(/\s+/)[0] ?? "");
    if (convergesToNotNull(sql, table, column)) continue;
    errors.push(`ALTER TABLE ${match[1]} ADD COLUMN must define the column as NOT NULL: ${match[2].trim()}`);
  }
  for (const match of sql.matchAll(
    /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?\s+on\s+"?([a-zA-Z0-9_]+)"?\s*\(([^)]+)\)/gi,
  )) {
    const expected = canonicalIndexName({
      unique: Boolean(match[1]),
      table: match[3],
      columns: columnsFromName(match[4]),
    });
    if (match[2] !== expected) {
      errors.push(`index must be named ${expected}, got ${match[2]}`);
    }
  }
  for (const match of sql.matchAll(/constraint\s+"?([a-zA-Z0-9_]+)"?\s+foreign\s+key\s*\(([^)]+)\)/gi)) {
    if (!/^fk__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(match[1])) {
      errors.push(`foreign key name must match fk__{table}__{column}: ${match[1]}`);
    }
  }
  for (const match of sql.matchAll(/constraint\s+"?([a-zA-Z0-9_]+)"?\s+check\b/gi)) {
    if (!/^ck__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(match[1])) {
      errors.push(`check constraint name must match ck__{table}__{rule}: ${match[1]}`);
    }
  }
  // Index names are derived, so `canonicalIndexName` already caps them. Constraint names are
  // author-chosen, so they need the cap applied as a rule of its own.
  for (const match of sql.matchAll(/constraint\s+"?([a-zA-Z0-9_]+)"?/gi)) {
    if (exceedsIdentifierLimit(match[1])) {
      errors.push(
        `constraint name exceeds the PostgreSQL ${postgresIdentifierMaxBytes}-byte identifier limit and would be silently truncated: ${match[1]}`,
      );
    }
  }
  return errors;
}
