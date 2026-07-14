import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = join(import.meta.dirname, '../../../../../..');
const sourceRoots = [
  'apps/frontend/app/src',
  'apps/frontend/admin/src',
  'apps/frontend/landing/src',
  'apps/frontend/site/pages',
  'apps/frontend/site/renderer',
  'apps/frontend/site/server',
  'apps/frontend/mobile/src',
  'libs/frontend/api-client/lib/src',
  'libs/frontend/api-support/lib/src',
  'libs/frontend/feature/admin/shared/lib/src',
  'libs/frontend/runtime/lib/src',
  'libs/frontend/ui/lib/src',
  'libs/frontend/ui-native/lib/src',
  'libs/frontend/ui-web/lib/src',
];
const appSourceRoots = [
  'apps/frontend/app/src',
  'apps/frontend/admin/src',
  'apps/frontend/landing/src',
  'apps/frontend/site/pages',
  'apps/frontend/site/renderer',
  'apps/frontend/site/server',
  'apps/frontend/mobile/src',
];
const allowedExtensions = new Set(['.ts', '.tsx', '.css']);
const ignoredSuffixes = ['.spec.ts', '.spec.tsx', '.stories.tsx'];
const ignoredDirectories = new Set(['.git', '.nx', 'coverage', 'dist', 'node_modules']);
const legacyFrontendAliasPatterns = [/@app\/frontend\//u];
const backendBoundaryPatterns = [/@app\/backend/u, /(?:^|["'])apps\/backend/u, /(?:^|["'])libs\/backend/u];

const walk = (directory: string): string[] => {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    const ignored = relative(workspaceRoot, path)
      .split(/[/\\]/u)
      .some((segment) => ignoredDirectories.has(segment));

    return stat.isDirectory() && !ignored ? walk(path) : [path];
  });
};

const isCheckedFile = (path: string): boolean =>
  allowedExtensions.has(extname(path)) &&
  !relative(workspaceRoot, path)
    .split(/[/\\]/u)
    .some((segment) => ignoredDirectories.has(segment)) &&
  !ignoredSuffixes.some((suffix) => path.endsWith(suffix));

const readCheckedFiles = (
  roots: readonly string[],
): Array<{
  path: string;
  content: string;
}> =>
  roots
    .flatMap((root) => walk(join(workspaceRoot, root)))
    .filter(isCheckedFile)
    .map((path) => ({
      path: relative(workspaceRoot, path),
      content: readFileSync(path, 'utf8'),
    }));

describe('frontend clean boundaries', () => {
  it('uses canonical frontend aliases in production frontend sources', () => {
    const offenders = readCheckedFiles(sourceRoots)
      .filter(({ content }) => legacyFrontendAliasPatterns.some((pattern) => pattern.test(content)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps frontend sources free of direct backend imports', () => {
    const offenders = readCheckedFiles(sourceRoots)
      .filter(({ content }) => backendBoundaryPatterns.some((pattern) => pattern.test(content)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('keeps app code behind frontend-owned shared facades', () => {
    const offenders = readCheckedFiles(appSourceRoots)
      .filter(({ content }) => content.includes('@app/common/'))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
