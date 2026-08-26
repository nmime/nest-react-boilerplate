import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { FilesystemAdapter } from '../setup/adapters/filesystem.js';
import { parseNrbConfig, type NrbConfig } from '../setup/schema.js';
import { emptyState, migrateState, type SetupState } from '../setup/state.js';
import {
  createIdentityManifestConfig,
  defaultConfigPath,
  identityManifestPath,
  isIdentityManifest,
  setupStatePath,
  type IdentityManifest,
} from './engine.js';

export function loadDesiredConfig(workspaceRoot: string, configPath?: string): NrbConfig {
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(workspaceRoot, configPath)
    : join(workspaceRoot, defaultConfigPath);
  if (!existsSync(path)) throw new Error(`Configuration file not found: ${path}`);
  return parseNrbConfig(JSON.parse(readFileSync(path, 'utf8')));
}

export async function loadIdentityManifest(fs: FilesystemAdapter): Promise<IdentityManifest | null> {
  const content = await fs.read(identityManifestPath);
  if (content === null) return null;
  const raw = JSON.parse(content) as unknown;
  if (!isIdentityManifest(raw)) throw new Error(`${identityManifestPath} is malformed; restore it or pass --force.`);
  return raw;
}

export async function loadSetupState(fs: FilesystemAdapter): Promise<SetupState> {
  const content = await fs.read(setupStatePath);
  if (content === null) return emptyState;
  try {
    return migrateState(JSON.parse(content));
  } catch {
    return emptyState;
  }
}

export function resolvePreviousConfig(desired: NrbConfig, manifest: IdentityManifest | null): NrbConfig {
  return createIdentityManifestConfig(desired, manifest);
}

export function templateBase(workspaceRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function assertCleanGitWorkspace(workspaceRoot: string, force: boolean): void {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot, encoding: 'utf8' });
    if (status.trim() && !force) {
      throw new Error('Refusing to reconfigure with a dirty worktree. Commit/stash changes or pass --force.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing to reconfigure')) throw error;
    if (!force) {
      throw new Error(
        `Refusing to reconfigure because the git worktree status is unknown. Run inside a git checkout or pass --force.`,
      );
    }
  }
}
