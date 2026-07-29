import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(appRoot, '../../..');
const serverRoot = resolve(workspaceRoot, 'dist/apps/frontend/site/server');
const dependencyRoots = [
  join(appRoot, 'node_modules'),
  join(workspaceRoot, 'libs/frontend/node_modules'),
  join(workspaceRoot, 'node_modules'),
];
const sourceNodeModules = dependencyRoots.find((path) => existsSync(path));
const serverNodeModules = join(serverRoot, 'node_modules');

if (!existsSync(serverRoot)) {
  throw new Error(`Missing Vike server output: ${serverRoot}`);
}

if (!sourceNodeModules) {
  throw new Error(`Missing site dependencies: ${dependencyRoots.join(' or ')}`);
}

if (existsSync(serverNodeModules)) {
  if (lstatSync(serverNodeModules).isSymbolicLink()) {
    console.log(
      JSON.stringify({
        status: 'ok',
        linked: relative(workspaceRoot, serverNodeModules),
      }),
    );
    process.exit(0);
  }

  throw new Error(`${serverNodeModules} exists and is not a symlink`);
}

symlinkSync(relative(serverRoot, sourceNodeModules), serverNodeModules, 'dir');

console.log(
  JSON.stringify({
    status: 'ok',
    linked: relative(workspaceRoot, serverNodeModules),
  }),
);
