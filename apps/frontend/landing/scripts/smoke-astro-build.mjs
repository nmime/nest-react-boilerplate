// @requirements REQ-FRONTEND-SSR-007
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appName = 'landing-app';
const distRoot = resolve(import.meta.dirname, '../../../../dist/apps/frontend/landing');
const expectedCopy = 'A focused foundation for your next product.';

const containsExactUrl = (contents, expectedValue) => {
  const expected = new URL(expectedValue);
  const candidates = contents.match(/https:\/\/[^"'`<>\s\\]+/gu) ?? [];

  return candidates.some((candidate) => {
    try {
      const parsed = new URL(candidate);
      return (
        parsed.protocol === expected.protocol &&
        parsed.username === expected.username &&
        parsed.password === expected.password &&
        parsed.host === expected.host &&
        parsed.pathname === expected.pathname &&
        parsed.search === expected.search &&
        parsed.hash === expected.hash
      );
    } catch {
      return false;
    }
  });
};

const readBuiltTextFiles = (directory) => {
  const entries = readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return readBuiltTextFiles(entryPath);
    }

    if (!/\.(?:css|html|js)$/u.test(entry.name)) {
      return [];
    }

    return [readFileSync(entryPath, 'utf8')];
  });
};

const indexPath = join(distRoot, 'index.html');
const problemRegistryPath = join(distRoot, 'problems', 'index.html');

if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  throw new Error(`[${appName}] missing built index.html at ${indexPath}`);
}

if (!existsSync(problemRegistryPath) || !statSync(problemRegistryPath).isFile()) {
  throw new Error(`[${appName}] missing problem registry at ${problemRegistryPath}`);
}

const searchable = readBuiltTextFiles(distRoot).join('\n');
const indexHtml = readFileSync(indexPath, 'utf8');

if (!searchable.includes(expectedCopy)) {
  throw new Error(`[${appName}] expected landing copy not found in Astro build.`);
}

if (!containsExactUrl(searchable, 'https://example.com/problems#client-data-validation')) {
  throw new Error(`[${appName}] RFC 9457 problem registry is missing from the Astro build.`);
}

if (!/<meta[^>]+http-equiv="content-security-policy"[^>]+sha256-/u.test(indexHtml)) {
  throw new Error(`[${appName}] Astro build is missing its hash-based hydration CSP.`);
}

console.log(
  JSON.stringify({
    appName,
    indexPath: relative(process.cwd(), indexPath),
    expectedCopy,
    status: 'ok',
  }),
);
