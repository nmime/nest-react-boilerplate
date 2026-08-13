import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { collectRuntimePackages } from './runtime-imports.mjs';

const appName = 'site-app';
const distRoot = resolve(import.meta.dirname, '../../../../dist/apps/frontend/site');
const runtimeDependenciesPath = resolve(import.meta.dirname, '../runtime-dependencies.json');
const expectedCopy = 'A dependable home for the pages people return to.';

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
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return readBuiltTextFiles(entryPath);
    }

    if (!/\.(?:css|html|js|mjs)$/u.test(entry.name)) {
      return [];
    }

    return [readFileSync(entryPath, 'utf8')];
  });
};

if (!existsSync(distRoot) || !statSync(distRoot).isDirectory()) {
  throw new Error(`[${appName}] missing build output at ${distRoot}`);
}

const searchable = readBuiltTextFiles(distRoot).join('\n');

if (!searchable.includes(expectedCopy)) {
  throw new Error(`[${appName}] expected Vike site copy not found in build.`);
}

if (!containsExactUrl(searchable, 'https://example.com/problems') || !searchable.includes('client-data-validation')) {
  throw new Error(`[${appName}] RFC 9457 problem registry is missing from the Vike build.`);
}

const serverEntry = join(distRoot, 'server/index.js');
if (!existsSync(serverEntry)) {
  throw new Error(`[${appName}] missing compiled Fastify server entry at ${serverEntry}`);
}

const declaredRuntimePackages = new Set(JSON.parse(readFileSync(runtimeDependenciesPath, 'utf8')));
const serverOutput = readBuiltTextFiles(join(distRoot, 'server')).join('\n');
const runtimePackages = collectRuntimePackages(serverOutput);
const undeclaredRuntimePackages = runtimePackages.filter((packageName) => !declaredRuntimePackages.has(packageName));

if (undeclaredRuntimePackages.length > 0) {
  throw new Error(
    `[${appName}] SSR output imports undeclared runtime packages: ${undeclaredRuntimePackages.sort().join(', ')}`,
  );
}

console.log(
  JSON.stringify({
    appName,
    distRoot: relative(process.cwd(), distRoot),
    expectedCopy,
    runtimePackages,
    status: 'ok',
  }),
);
