import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(appRoot, '../../..');
const serverRoot = resolve(workspaceRoot, 'dist/apps/frontend/site/server');
const appNodeModules = join(appRoot, 'node_modules');
const serverNodeModules = join(serverRoot, 'node_modules');

if (!existsSync(serverRoot)) {
  throw new Error(`Missing Vike server output: ${serverRoot}`);
}

if (!existsSync(appNodeModules)) {
  throw new Error(`Missing site app dependencies: ${appNodeModules}`);
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

symlinkSync(relative(serverRoot, appNodeModules), serverNodeModules, 'dir');

console.log(
  JSON.stringify({
    status: 'ok',
    linked: relative(workspaceRoot, serverNodeModules),
  }),
);
