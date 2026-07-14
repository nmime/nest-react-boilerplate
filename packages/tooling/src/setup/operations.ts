/**
 * Discriminated operation types for the setup engine.
 *
 * Every operation carries a POSIX-style relative `path` and enough
 * information to be replayed deterministically.  No timestamps or
 * machine-specific values are encoded — snapshots are portable.
 */
import { isAbsolute, posix } from 'node:path';

// ---------------------------------------------------------------------------
// Operation kind discriminant
// ---------------------------------------------------------------------------

export type OperationKind = 'create_file' | 'update_file' | 'delete_file' | 'json_merge';

// ---------------------------------------------------------------------------
// Base — every operation has a kind, a relative POSIX path, and a human
// label suitable for progress output.
// ---------------------------------------------------------------------------

interface BaseOperation {
  kind: OperationKind;
  /** POSIX-style relative path (e.g. "apps/admin-app/src/main.ts"). */
  path: string;
  /** Short description for progress / summary output. */
  description: string;
}

// ---------------------------------------------------------------------------
// Create — write content to a new file.  Fails if the file already exists
// and `force` is not set on the apply pass.
// ---------------------------------------------------------------------------

export interface CreateFileOperation extends BaseOperation {
  kind: 'create_file';
  content: string;
}

// ---------------------------------------------------------------------------
// Update — overwrite an existing file entirely.  Fails if the file does not
// already exist (unless force-created).
// ---------------------------------------------------------------------------

export interface UpdateFileOperation extends BaseOperation {
  kind: 'update_file';
  content: string;
}

// ---------------------------------------------------------------------------
// Delete — remove an existing file.  No-op if the file is already absent.
// ---------------------------------------------------------------------------

export interface DeleteFileOperation extends BaseOperation {
  kind: 'delete_file';
}

// ---------------------------------------------------------------------------
// JsonMerge — shallow-merge `patch` into the existing JSON at `path`.
// The current content is parsed, spread with patch, then re-serialized with
// 2-space indentation and a trailing newline.
// ---------------------------------------------------------------------------

export interface JsonMergeOperation extends BaseOperation {
  kind: 'json_merge';
  /** Keys to merge into the existing JSON object. */
  patch: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type SetupOperation = CreateFileOperation | UpdateFileOperation | DeleteFileOperation | JsonMergeOperation;

// ---------------------------------------------------------------------------
// Path validation — reject unsafe paths at factory time.
// ---------------------------------------------------------------------------

/**
 * Validate that an operation path is a safe, relative POSIX path.
 *
 * Rejects:
 *   - NUL bytes (would truncate filenames on POSIX)
 *   - Empty strings (root target — destructive)
 *   - Absolute paths
 *   - Paths that escape the workspace via `..` traversal
 *   - Backslashes (Windows separators — we require POSIX)
 *
 * Uses posix.normalize + resolve to catch subtle traversal attacks
 * (e.g. "foo/bar/../../baz", "foo//../../../etc/passwd").
 */
export function validateOpPath(raw: string): string {
  if (typeof raw !== 'string') {
    throw new TypeError('Operation path must be a string');
  }

  // NUL bytes
  if (raw.indexOf('\0') !== -1) {
    throw new Error(`Operation path contains NUL byte: ${JSON.stringify(raw)}`);
  }

  // Empty
  if (raw.length === 0) {
    throw new Error('Operation path must not be empty');
  }

  // Backslashes (Windows separators)
  if (raw.indexOf('\\') !== -1) {
    throw new Error(`Operation path must not contain backslashes: ${JSON.stringify(raw)}`);
  }

  // Normalize with POSIX path rules
  const normalized = posix.normalize(raw);

  // Reject absolute paths (both posix and platform-native)
  if (posix.isAbsolute(normalized) || isAbsolute(normalized)) {
    throw new Error(`Operation path must not be absolute: ${JSON.stringify(raw)}`);
  }

  // Reject `..` escape: after normalization, a relative path must not start with `..`
  if (normalized.startsWith('..')) {
    throw new Error(`Operation path must not escape workspace via '..': ${JSON.stringify(raw)}`);
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Factory helpers — keep construction explicit and type-safe.
// All factories validate the path via validateOpPath.
// ---------------------------------------------------------------------------

export function createFile(path: string, content: string, description = `Create ${path}`): CreateFileOperation {
  return { kind: 'create_file', path: validateOpPath(path), content, description };
}

export function updateFile(path: string, content: string, description = `Update ${path}`): UpdateFileOperation {
  return { kind: 'update_file', path: validateOpPath(path), content, description };
}

export function deleteFile(path: string, description = `Delete ${path}`): DeleteFileOperation {
  return { kind: 'delete_file', path: validateOpPath(path), description };
}

export function jsonMerge(
  path: string,
  patch: Record<string, unknown>,
  description = `Merge ${path}`,
): JsonMergeOperation {
  return { kind: 'json_merge', path: validateOpPath(path), patch, description };
}

// ---------------------------------------------------------------------------
// Sorting — deterministic order so that the same plan always produces the
// same operation sequence.  Sort by: kind order (delete → update →
// json_merge → create), then by path lexicographically.
//
// Deletes first so directories can be cleaned before new files land;
// updates before creates so renames are handled as delete+create.
// ---------------------------------------------------------------------------

const KIND_ORDER: Record<OperationKind, number> = {
  delete_file: 0,
  update_file: 1,
  json_merge: 2,
  create_file: 3,
};

export function compareOperations(a: SetupOperation, b: SetupOperation): number {
  const kc = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kc !== 0) {
    return kc;
  }
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Return a new array sorted with `compareOperations`. */
export function sortOperations(ops: readonly SetupOperation[]): SetupOperation[] {
  return [...ops].sort(compareOperations);
}

// ---------------------------------------------------------------------------
// Equality — structural comparison for diffing plans.
// ---------------------------------------------------------------------------

export function operationsEqual(a: SetupOperation, b: SetupOperation): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.path !== b.path) {
    return false;
  }
  if (a.kind === 'create_file' || a.kind === 'update_file') {
    if (a.content !== (b as CreateFileOperation | UpdateFileOperation).content) {
      return false;
    }
  }
  if (a.kind === 'json_merge') {
    const pa = a.patch;
    const pb = (b as JsonMergeOperation).patch;
    const ka = Object.keys(pa).sort();
    const kb = Object.keys(pb).sort();
    if (ka.length !== kb.length) {
      return false;
    }
    for (let i = 0; i < ka.length; i++) {
      const keyA = ka[i];
      const keyB = kb[i];
      if (keyA === undefined || keyB === undefined || keyA !== keyB) {
        return false;
      }
      if (JSON.stringify(pa[keyA]) !== JSON.stringify(pb[keyB])) {
        return false;
      }
    }
  }
  return true;
}

/** Deep equality on sorted operation arrays. */
export function operationArraysEqual(a: SetupOperation[], b: SetupOperation[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const operationA = a[i];
    const operationB = b[i];
    if (operationA === undefined || operationB === undefined || !operationsEqual(operationA, operationB)) {
      return false;
    }
  }
  return true;
}
