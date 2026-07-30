// @requirements REQ-AUTH-CREDENTIAL-003
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Assembled from fragments so this spec's own source does not contain the specifier it forbids.
const forbiddenAdminSharedImport = ['@app/backend', 'feature', 'admin', 'shared'].join('-');

function collectTypescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return collectTypescriptFiles(fullPath);
    }

    return fullPath.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('auth shared RBAC boundary', () => {
  it('forbids a specifier that the workspace actually maps', () => {
    // Positive control: without this the assertion below silently passes forever
    // if the package is ever renamed or the fragments are mistyped.
    const tsconfig = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../../../tsconfig.base.json'),
        'utf8',
      ),
    ) as { compilerOptions: { paths: Record<string, string[]> } };

    expect(Object.keys(tsconfig.compilerOptions.paths)).toContain(forbiddenAdminSharedImport);
    expect(`import { X } from '${forbiddenAdminSharedImport}';`).toContain(forbiddenAdminSharedImport);
  });

  it('does not import admin shared from auth shared source', () => {
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const offenders = collectTypescriptFiles(sourceRoot)
      .filter((filePath) => readFileSync(filePath, 'utf8').includes(forbiddenAdminSharedImport))
      .map((filePath) => relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
