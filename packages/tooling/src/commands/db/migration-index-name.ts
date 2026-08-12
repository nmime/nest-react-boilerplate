import { createHash } from "node:crypto";

/**
 * PostgreSQL stores identifiers in a NAMEDATALEN (64) buffer and silently truncates anything
 * longer to 63 bytes. A migration that declares a longer index name therefore creates an index
 * under a name the migration never mentions, so the declared name and the stored name diverge and
 * a later DROP INDEX by the declared name fails.
 */
export const postgresIdentifierMaxBytes = 63;

const digestLength = 8;
const digestSeparator = "__";

export function exceedsIdentifierLimit(identifier: string) {
  return Buffer.byteLength(identifier) > postgresIdentifierMaxBytes;
}

/**
 * Truncation alone is not enough: two indexes on the same table whose column lists differ only
 * past the cut would collapse onto one name. Appending a digest of the full identifier keeps the
 * result both readable and distinct, and keeps it a pure function of the declared name so the
 * checker and the migration author always agree.
 */
export function truncateIdentifier(identifier: string) {
  if (!exceedsIdentifierLimit(identifier)) return identifier;
  const digest = createHash("sha256").update(identifier).digest("hex").slice(0, digestLength);
  const keep = postgresIdentifierMaxBytes - digestSeparator.length - digestLength;
  return `${identifier.slice(0, keep)}${digestSeparator}${digest}`;
}

export function canonicalIndexName(options: { unique: boolean; table: string; columns: string }) {
  const prefix = options.unique ? "uq" : "ix";
  return truncateIdentifier(`${prefix}__${options.table}__${options.columns}`);
}
