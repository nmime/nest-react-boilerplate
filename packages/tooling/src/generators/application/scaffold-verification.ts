// Evidence for: REQ-SCAFFOLD-GENERATORS-003
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type ScaffoldResourceClass = 'node' | 'browser' | 'ssr' | 'native';
export type ScaffoldVerificationTarget = 'build' | 'test' | 'typecheck';

const targetTimeoutMs: Record<ScaffoldResourceClass, Record<ScaffoldVerificationTarget, number>> = {
  node: { build: 360_000, test: 180_000, typecheck: 180_000 },
  browser: { build: 360_000, test: 180_000, typecheck: 180_000 },
  ssr: { build: 480_000, test: 180_000, typecheck: 240_000 },
  native: { build: 720_000, test: 180_000, typecheck: 240_000 },
};

export function scaffoldTargetTimeoutMs(resource: ScaffoldResourceClass, target: ScaffoldVerificationTarget): number {
  return targetTimeoutMs[resource][target];
}

interface ScaffoldLockOwner {
  pid: number;
  token: string;
}

export function assertScaffoldRootsAvailable(workspaceRoot: string, roots: readonly string[]): void {
  const existing = roots.filter((root) => existsSync(join(workspaceRoot, root)));
  if (existing.length > 0) {
    throw new Error(
      `Scaffold verification refuses to remove existing owner roots:\n${existing.map((root) => `- ${root}`).join('\n')}`,
    );
  }
}

export function scaffoldVerificationLockPath(workspaceRoot: string, temporaryRoot = tmpdir()): string {
  const workspaceHash = createHash('sha256').update(resolve(workspaceRoot)).digest('hex').slice(0, 16);
  return join(temporaryRoot, `nrb-scaffold-${workspaceHash}.lock`);
}

export function acquireScaffoldVerificationLock(workspaceRoot: string, temporaryRoot = tmpdir()): () => void {
  const lockPath = scaffoldVerificationLockPath(workspaceRoot, temporaryRoot);
  const ownerPath = join(lockPath, 'owner.json');
  const token = randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(lockPath);
      writeFileSync(ownerPath, `${JSON.stringify({ pid: process.pid, token })}\n`, { flag: 'wx' });
      return () => {
        try {
          const owner = JSON.parse(readFileSync(ownerPath, 'utf8')) as ScaffoldLockOwner;
          if (owner.token === token) rmSync(lockPath, { force: true, recursive: true });
        } catch {
          // Never remove a lock whose ownership can no longer be proven.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let owner: ScaffoldLockOwner | undefined;
      try {
        owner = JSON.parse(readFileSync(ownerPath, 'utf8')) as ScaffoldLockOwner;
      } catch {
        throw new Error(`Scaffold verification lock exists without readable ownership: ${lockPath}`);
      }
      if (processIsRunning(owner.pid)) {
        throw new Error(`Scaffold verification is already running in this workspace (pid ${owner.pid}).`);
      }
      rmSync(lockPath, { force: true, recursive: true });
    }
  }

  throw new Error(`Unable to acquire scaffold verification lock: ${lockPath}`);
}

function processIsRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
