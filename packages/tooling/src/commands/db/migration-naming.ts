/**
 * A migration class is named `Migration` + a 14-digit timestamp + a PascalCase description, and the
 * file is named for the class it exports. The standards gate selects the files it validates with
 * this shape, and the secret scanner uses it to recognise a class name written as a string literal
 * (setup catalog entries, migration-registry specs) — such a name is long and varied enough to look
 * like a high-entropy secret. Both read the convention from here so the gate that mandates the name
 * and the gate that would reject it cannot drift apart.
 */
export const migrationClassNamePattern = /^Migration\d{14}[A-Z][A-Za-z0-9]*$/u;

export function isMigrationFilePath(path: string) {
  const name = /\/migrations\/([^/]+)\.ts$/u.exec(path.replaceAll("\\", "/"))?.[1];
  return name !== undefined && migrationClassNamePattern.test(name);
}
