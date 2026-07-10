/**
 * Setup state management.
 *
 * Tracks the hash of the configuration that was last applied, per-file
 * content hashes, and a global state digest.  Used by the planner to
 * decide which operations are still necessary and by the applier to
 * verify post-run consistency.
 *
 * All hashes are stable SHA-256 hex strings — no timestamps or machine
 * paths are encoded.
 */
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Hashing helpers
// ---------------------------------------------------------------------------

/** Produce a SHA-256 hex digest of a UTF-8 string. */
export function hashString(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute a stable hash for a config object.
 * The config is stringified with deterministic key ordering and then hashed.
 */
export function configHash(config: Record<string, unknown>): string {
  const canonical = JSON.stringify(config, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
  return hashString(canonical);
}

// ---------------------------------------------------------------------------
// File entry — tracks a single file's state
// ---------------------------------------------------------------------------

export interface FileEntry {
  /** POSIX relative path. */
  path: string;
  /** SHA-256 of the file content after last successful apply. */
  contentHash: string;
}

// ---------------------------------------------------------------------------
// SetupState — the serialisable state blob stored in `.nrb/state.json`
// ---------------------------------------------------------------------------

export interface SetupState {
  /** Version of the state format. */
  version: 1;
  /** SHA-256 of the config that produced this state. */
  configHash: string;
  /** Per-file hashes indexed by POSIX relative path. */
  files: Record<string, string>;
  /** Global digest computed from all file hashes. */
  digest: string;
}

/** Empty state — represents a fresh workspace with nothing generated yet. */
export const EMPTY_STATE: SetupState = {
  version: 1,
  configHash: '',
  files: {},
  digest: '',
};

// ---------------------------------------------------------------------------
// State computation
// ---------------------------------------------------------------------------

/**
 * Compute the global digest from a set of per-file hashes.
 * Sorts file paths lexicographically before hashing so the digest is
 * independent of insertion order.
 */
export function computeStateDigest(files: Record<string, string>): string {
  const entries = Object.entries(files).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (entries.length === 0) {
    return hashString('{}');
  }
  const serialized = JSON.stringify(Object.fromEntries(entries));
  return hashString(serialized);
}

/**
 * Build a SetupState from a config hash and a map of file paths → content hashes.
 */
export function buildState(configHash: string, files: Record<string, string>): SetupState {
  return {
    version: 1,
    configHash,
    files,
    digest: computeStateDigest(files),
  };
}

/**
 * Update state with a new file hash.  Returns a new state object
 * (immutable — the original is not mutated).
 */
export function addFileToState(state: SetupState, path: string, contentHash: string): SetupState {
  const newFiles = { ...state.files, [path]: contentHash };
  return buildState(state.configHash, newFiles);
}

/**
 * Remove a file entry from state.  Returns a new state object.
 */
export function removeFileFromState(state: SetupState, path: string): SetupState {
  const newFiles = { ...state.files };
  delete newFiles[path];
  return buildState(state.configHash, newFiles);
}

// ---------------------------------------------------------------------------
// State diffing
// ---------------------------------------------------------------------------

/**
 * Compare desired file hashes against the current state and return three
 * sets: files to create/update, files to leave alone, and files to prune.
 */
export function diffState(
  current: SetupState,
  desired: Record<string, string>,
): {
  toUpdate: string[];
  toCreate: string[];
  toPrune: string[];
  unchanged: string[];
} {
  const currentSet = new Set(Object.keys(current.files));
  const desiredSet = new Set(Object.keys(desired));

  const toUpdate: string[] = [];
  const toCreate: string[] = [];
  const unchanged: string[] = [];

  for (const path of desiredSet) {
    if (currentSet.has(path)) {
      if (current.files[path] !== desired[path]) {
        toUpdate.push(path);
      } else {
        unchanged.push(path);
      }
    } else {
      toCreate.push(path);
    }
  }

  const toPrune: string[] = [];
  for (const path of currentSet) {
    if (!desiredSet.has(path)) {
      toPrune.push(path);
    }
  }

  return {
    toUpdate: toUpdate.sort(),
    toCreate: toCreate.sort(),
    toPrune: toPrune.sort(),
    unchanged: unchanged.sort(),
  };
}

// ---------------------------------------------------------------------------
// State migration
// ---------------------------------------------------------------------------

/**
 * Migrate an older version of the state to the latest version.
 * Currently only v1 exists; this is a placeholder for future migrations.
 */
export function migrateState(raw: unknown): SetupState {
  if (typeof raw !== 'object' || raw === null) {
    return EMPTY_STATE;
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.version as number | undefined;
  if (version === undefined || version < 1) {
    // Pre-version state: treat as empty
    return EMPTY_STATE;
  }
  if (version === 1) {
    return obj as unknown as SetupState;
  }
  // Future versions: for now, treat as empty to force re-plan
  return EMPTY_STATE;
}

// ---------------------------------------------------------------------------
// Config digest (alias for convenience)
// ---------------------------------------------------------------------------

/**
 * Compute a stable digest string from a full config object.
 * Uses deterministic JSON serialization with sorted keys.
 */
export function computeConfigDigest(config: Record<string, unknown>): string {
  return configHash(config);
}
