import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appName = 'site-app';
const distRoot = resolve(import.meta.dirname, '../../../../dist/apps/frontend/site');
const runtimePackagePath = resolve(import.meta.dirname, '../package.json');
const expectedCopy = 'Production web experience';

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

const serverEntry = join(distRoot, 'server/index.js');
if (!existsSync(serverEntry)) {
  throw new Error(`[${appName}] missing compiled Fastify server entry at ${serverEntry}`);
}

const runtimePackage = JSON.parse(readFileSync(runtimePackagePath, 'utf8'));
const declaredRuntimePackages = new Set(Object.keys(runtimePackage.dependencies ?? {}));
const serverOutput = readBuiltTextFiles(join(distRoot, 'server')).join('\n');
const bareImports = [...serverOutput.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/gu)].map(
  ([, , specifier]) => specifier,
);
const runtimeImports = new Set(
  bareImports
    .filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:'))
    .map((specifier) =>
      specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0],
    ),
);
const undeclaredRuntimePackages = [...runtimeImports].filter(
  (packageName) => !declaredRuntimePackages.has(packageName),
);

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
    runtimePackages: [...runtimeImports].sort(),
    status: 'ok',
  }),
);
