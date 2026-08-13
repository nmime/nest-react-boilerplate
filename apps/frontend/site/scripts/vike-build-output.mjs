import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// What `server/index.ts` imports and serves at runtime. Vike's `build()` resolves successfully even
// when it could not execute `+config.ts` — it logs the failure and then builds an app with no pages
// — so the build gate cannot read success from the call and has to read it from the artefacts.
const requiredOutputs = [
  { path: 'server/entry.mjs', isSatisfiedBy: (stats) => stats.isFile() },
  { path: 'client', isSatisfiedBy: (stats) => stats.isDirectory() },
];

export function findMissingVikeBuildOutputs(distRoot) {
  return requiredOutputs
    .filter(({ path, isSatisfiedBy }) => {
      const absolutePath = join(distRoot, path);
      return !existsSync(absolutePath) || !isSatisfiedBy(statSync(absolutePath));
    })
    .map(({ path }) => path);
}
