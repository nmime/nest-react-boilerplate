/**
 * Atomic plan application with full rollback on failure.
 *
 * The applier executes a list of SetupOperations through a FilesystemAdapter.
 * Before applying, it backs up all affected files.  If any operation fails,
 * all originals are restored and no partial state is left on disk.
 *
 * Conflict protection: if a file that the plan expects to operate on is in
 * an unexpected state (e.g. create_file on an existing file, or json_merge
 * on a missing file), the apply is refused unless `force` is true.
 *
 * Prune protection: delete operations are only emitted when the planner
 * was configured with `prune: true`.  The applier trusts the planner's
 * output and does not independently decide what to delete.
 */
import type { SetupOperation } from './operations.js';
import type { FilesystemAdapter, FileConflict, ApplyResult } from './adapters/filesystem.js';
import { hashString } from './state.js';

// ---------------------------------------------------------------------------
// Apply options
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  /** Overwrite conflicts without refusing. */
  force?: boolean;
  /** Simulate without writing (for dry-run). */
  dryRun?: boolean;
  /**
   * Paths at which the applier should simulate a write failure.
   * Used for testing rollback behaviour.
   */
  failOnPaths?: string[];
  /**
   * Optional state from the planner.  When provided, conflict detection
   * compares the current file content hash against the state's recorded
   * hash — not against the planned content.  This detects third-party
   * modifications between planning and applying.
   */
  stateFiles?: Record<string, string>;
}

const DEFAULT_OPTIONS: ApplyOptions = {
  force: false,
  dryRun: false,
  failOnPaths: [],
};

// ---------------------------------------------------------------------------
// Backup entry — stores original content for rollback
// ---------------------------------------------------------------------------

interface BackupEntry {
  path: string;
  content: string;
  existed: boolean;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Check for conflicts before applying.
 *
 * When `stateFiles` is provided (from the planner), we compare current
 * on-disk hashes against the planner's recorded hashes.  A mismatch means
 * a third party modified the file after the plan was generated.
 *
 * When `stateFiles` is NOT provided, we use heuristic checks:
 *   - create_file: conflict if file already exists
 *   - json_merge: conflict if file is missing
 *   - update_file: no heuristic conflict (the update changes content by design)
 */
export async function checkConflicts(
  operations: readonly SetupOperation[],
  fs: FilesystemAdapter,
  stateFiles?: Record<string, string>,
): Promise<FileConflict[]> {
  const conflicts: FileConflict[] = [];

  for (const op of operations) {
    if (stateFiles !== undefined && stateFiles[op.path]) {
      // State-aware: compare current hash against recorded hash
      const currentContent = await fs.read(op.path);
      const currentHash = currentContent !== null ? hashString(currentContent) : '';
      const recordedHash = stateFiles[op.path];

      if (currentHash !== recordedHash) {
        if (op.kind === 'create_file' && currentContent !== null) {
          conflicts.push({
            path: op.path,
            reason: 'unexpected',
            expectedHash: '',
            actualHash: currentHash,
          });
        } else if (op.kind === 'delete_file' && currentContent !== null) {
          // File was supposed to be gone but exists — not a conflict for deletes
        } else {
          conflicts.push({
            path: op.path,
            reason: 'content_changed',
            expectedHash: recordedHash,
            actualHash: currentHash,
          });
        }
      }
    } else {
      // Heuristic mode (no state available)
      if (op.kind === 'create_file') {
        const exists = await fs.exists(op.path);
        if (exists) {
          conflicts.push({
            path: op.path,
            reason: 'unexpected',
          });
        }
      } else if (op.kind === 'json_merge') {
        const content = await fs.read(op.path);
        if (content === null) {
          conflicts.push({
            path: op.path,
            reason: 'missing',
          });
        }
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Backup — backs up ALL files touched by any operation, including creates
// ---------------------------------------------------------------------------

/**
 * Back up all files that will be modified by the given operations.
 * For create_file, records that the file didn't exist so rollback can remove it.
 */
export async function backupFiles(
  operations: readonly SetupOperation[],
  fs: FilesystemAdapter,
): Promise<BackupEntry[]> {
  const backups: BackupEntry[] = [];
  const seen = new Set<string>();

  for (const op of operations) {
    if (seen.has(op.path)) {
      continue;
    }
    seen.add(op.path);

    const content = await fs.read(op.path);
    backups.push({
      path: op.path,
      content: content ?? '',
      existed: content !== null,
    });
  }

  return backups;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

/**
 * Restore all backed-up files to their original state.
 * Files that existed before are restored; files that didn't exist are deleted.
 */
export async function rollback(backups: readonly BackupEntry[], fs: FilesystemAdapter): Promise<void> {
  for (const entry of backups) {
    if (entry.existed) {
      await fs.write(entry.path, entry.content);
    } else {
      await fs.delete(entry.path);
    }
  }
}

// ---------------------------------------------------------------------------
// Execute a single operation
// ---------------------------------------------------------------------------

async function executeOperation(op: SetupOperation, fs: FilesystemAdapter, options: ApplyOptions): Promise<void> {
  if (options.failOnPaths?.includes(op.path)) {
    throw new Error(`Injected failure: refusing to write to ${op.path}`);
  }

  switch (op.kind) {
    case 'create_file': {
      if (!options.force) {
        const exists = await fs.exists(op.path);
        if (exists) {
          throw new Error(`Conflict: ${op.path} already exists (use force to overwrite)`);
        }
      }
      await fs.write(op.path, op.content);
      break;
    }

    case 'update_file': {
      await fs.write(op.path, op.content);
      break;
    }

    case 'delete_file': {
      await fs.delete(op.path);
      break;
    }

    case 'json_merge': {
      const current = await fs.read(op.path);
      let parsed: Record<string, unknown>;
      if (current === null) {
        if (options.force) {
          parsed = {};
        } else {
          throw new Error(`Conflict: ${op.path} does not exist for json_merge (use force to create)`);
        }
      } else {
        parsed = JSON.parse(current);
      }
      const merged = { ...parsed, ...op.patch };
      await fs.write(op.path, JSON.stringify(merged, null, 2) + '\n');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main apply
// ---------------------------------------------------------------------------

/**
 * Apply a list of operations atomically.
 *
 * 1. Check for conflicts (unless `force`).
 * 2. Back up all affected files (including targets of create operations).
 * 3. Execute operations in order.
 * 4. On success: return results.
 * 5. On failure: roll back ALL backups, return error.
 */
export async function apply(
  operations: readonly SetupOperation[],
  fs: FilesystemAdapter,
  options: ApplyOptions = DEFAULT_OPTIONS,
): Promise<ApplyResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result: ApplyResult = {
    applied: 0,
    skipped: 0,
    failed: 0,
    conflicts: [],
  };

  // Empty plan — no-op
  if (operations.length === 0) {
    return result;
  }

  // Conflict check (unless force)
  if (!opts.force) {
    const conflicts = await checkConflicts(operations, fs, opts.stateFiles);
    if (conflicts.length > 0) {
      result.conflicts = conflicts;
      result.failed = conflicts.length;
      return result;
    }
  }

  // Dry run — report what would happen
  if (opts.dryRun) {
    result.applied = operations.length;
    return result;
  }

  // Backup ALL files touched by operations (including create targets)
  const backups = await backupFiles(operations, fs);

  // Execute operations
  let failed = false;
  let failureReason: string | undefined;

  for (const op of operations) {
    try {
      await executeOperation(op, fs, opts);
      result.applied++;
    } catch (err: unknown) {
      failed = true;
      failureReason = err instanceof Error ? err.message : String(err);
      result.failed++;
      break;
    }
  }

  // Rollback on failure — restore ALL files to pre-apply state
  if (failed) {
    await rollback(backups, fs);
    result.rollbackError = failureReason;
    result.applied = 0; // All changes were rolled back
  }

  return result;
}

// ---------------------------------------------------------------------------
// No-op detection
// ---------------------------------------------------------------------------

/**
 * Check if an operation is a no-op against the current filesystem state.
 * An operation is a no-op if the file already has the desired content.
 */
export async function isNoOp(op: SetupOperation, fs: FilesystemAdapter): Promise<boolean> {
  switch (op.kind) {
    case 'create_file': {
      const exists = await fs.exists(op.path);
      if (!exists) {
        return false;
      }
      const content = await fs.read(op.path);
      return content === op.content;
    }
    case 'update_file': {
      const content = await fs.read(op.path);
      return content === op.content;
    }
    case 'delete_file': {
      return !(await fs.exists(op.path));
    }
    case 'json_merge': {
      const content = await fs.read(op.path);
      if (content === null) {
        return false;
      }
      const parsed = JSON.parse(content);
      for (const [key, value] of Object.entries(op.patch)) {
        if (JSON.stringify(parsed[key as keyof typeof parsed]) !== JSON.stringify(value)) {
          return false;
        }
      }
      return true;
    }
  }
}

/**
 * Filter operations, returning only those that are not no-ops.
 */
export async function filterNoOps(
  operations: readonly SetupOperation[],
  fs: FilesystemAdapter,
): Promise<SetupOperation[]> {
  const result: SetupOperation[] = [];
  for (const op of operations) {
    if (!(await isNoOp(op, fs))) {
      result.push(op);
    }
  }
  return result;
}
