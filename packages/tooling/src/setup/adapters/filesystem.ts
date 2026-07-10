/**
 * Filesystem adapter contract.
 *
 * The setup engine never imports `node:fs` directly — all I/O goes through
 * this abstraction.  Tests provide an in-memory adapter; production uses the
 * Node.js implementation.
 *
 * All paths are POSIX-style relative strings (e.g. `"apps/admin-app/src/main.ts"`).
 */

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface FilesystemAdapter {
  /**
   * Read the full text content of a file.
   * Returns `null` if the file does not exist.
   */
  read(path: string): Promise<string | null>;

  /**
   * Write content to a file atomically.
   * Implementation MUST write to a temporary file first, then rename
   * into place — a crash mid-write must not corrupt the target.
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Delete a file.  No-op if the file does not exist.
   */
  delete(path: string): Promise<void>;

  /**
   * Check if a file exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * List all file paths under a directory (recursive).
   * Returns POSIX relative paths.  Empty string root lists all tracked files.
   */
  list(dir?: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Conflict descriptor — returned by the apply layer when a file on disk
// differs from what the planner expects and `force` is not set.
// ---------------------------------------------------------------------------

export interface FileConflict {
  /** Path of the conflicting file. */
  path: string;
  /** Reason for the conflict. */
  reason: 'content_changed' | 'missing' | 'unexpected';
  /** Expected content hash (empty if file should not exist). */
  expectedHash?: string;
  /** Actual content hash (empty if file does not exist). */
  actualHash?: string;
}

// ---------------------------------------------------------------------------
// Apply result
// ---------------------------------------------------------------------------

export interface ApplyResult {
  /** Number of operations that were applied. */
  applied: number;
  /** Number of operations that were skipped (no-ops). */
  skipped: number;
  /** Number of operations that failed and were rolled back. */
  failed: number;
  /** Conflicts detected before applying (empty when no conflicts). */
  conflicts: FileConflict[];
  /** Error message if the entire transaction was rolled back. */
  rollbackError?: string;
}
