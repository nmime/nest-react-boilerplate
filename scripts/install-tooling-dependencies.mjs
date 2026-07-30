#!/usr/bin/env node
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function removeWorkspaceDependencyTrees(workspaceRoot) {
  rmSync(resolve(workspaceRoot, 'node_modules'), { force: true, recursive: true });
  for (const ownershipRoot of ['apps', 'libs', 'packages']) {
    removeNestedDependencyTrees(resolve(workspaceRoot, ownershipRoot));
  }
}

function removeNestedDependencyTrees(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.name === 'node_modules') rmSync(child, { force: true, recursive: true });
    else if (entry.isDirectory()) removeNestedDependencyTrees(child);
  }
}

export function installToolingDependencies(workspaceRoot = process.cwd()) {
  removeWorkspaceDependencyTrees(workspaceRoot);
  return (
    spawnSync('pnpm', ['install', '--frozen-lockfile'], {
      cwd: workspaceRoot,
      stdio: 'inherit',
    }).status ?? 1
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = installToolingDependencies();
}
