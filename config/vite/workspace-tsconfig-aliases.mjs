import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsconfigBasePath = resolve(workspaceRoot, 'tsconfig.base.json');

const normalizePath = (value) => value.replaceAll('\\', '/');

export function workspaceTsconfigAliases() {
  const tsconfig = JSON.parse(readFileSync(tsconfigBasePath, 'utf8'));
  const paths = tsconfig.compilerOptions?.paths ?? {};

  return Object.fromEntries(
    Object.entries(paths)
      .flatMap(([alias, targets]) => {
        const [target] = Array.isArray(targets) ? targets : [];

        if (typeof target !== 'string' || target.length === 0) {
          return [];
        }

        const normalizedAlias = alias.endsWith('/*') ? alias.slice(0, -2) : alias;
        const normalizedTarget = target.endsWith('/*') ? target.slice(0, -2) : target;

        return [[normalizedAlias, normalizePath(resolve(workspaceRoot, normalizedTarget))]];
      })
      // Vite matches string aliases by prefix and keeps the first hit, in declaration order. So a
      // library's secondary entry point — `@app/x/y` alongside `@app/x` — resolves only when it is
      // declared first; declared second it silently rewrites to `<x's index.ts>/y`. Longest alias
      // first is the ordering that holds however tsconfig.base.json happens to list them.
      .sort(([left], [right]) => right.length - left.length),
  );
}
