import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appName = 'site-app';
const distRoot = resolve(import.meta.dirname, '../../../../dist/apps/frontend/site');
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

console.log(
  JSON.stringify({
    appName,
    distRoot: relative(process.cwd(), distRoot),
    expectedCopy,
    status: 'ok',
  }),
);
