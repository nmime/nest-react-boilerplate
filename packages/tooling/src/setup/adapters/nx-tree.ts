/**
 * Nx Tree adapter — bridges the Nx virtual filesystem (Tree) to our
 * setup engine's FilesystemAdapter contract.
 *
 * Used by Nx generators to apply setup engine operations (create/update/delete
 * files, json_merge) inside the Nx virtual filesystem.  In production the
 * applier writes to disk through the Node filesystem adapter; here we write
 * to the Tree so that `formatFiles` and change tracking work correctly.
 */
import type { FilesystemAdapter } from "../adapters/filesystem.js";
import type { Tree } from "nx/src/generators/tree";

// ---------------------------------------------------------------------------

/**
 * Create a FilesystemAdapter backed by an Nx Tree instance.
 *
 * All paths are POSIX-style relative to the workspace root.
 * The adapter stores writes in the Tree's virtual filesystem and tracks
 * changes via `tree.listChanges()`.
 */
export function createNxTreeAdapter(tree: Tree): FilesystemAdapter {
  return {
    async read(path: string): Promise<string | null> {
      const content = tree.read(path, "utf8");
      return content === null ? null : content;
    },

    async write(path: string, content: string): Promise<void> {
      tree.write(path, content);
    },

    async delete(path: string): Promise<void> {
      if (tree.exists(path)) {
        tree.delete(path);
      }
    },

    async exists(path: string): Promise<boolean> {
      return tree.exists(path);
    },

    async list(dir = ""): Promise<string[]> {
      const results: string[] = [];

      // Safety: if dir is empty or doesn't exist, return sorted array of root files
      let topLevel: string[];
      try {
        topLevel = tree.children(dir || "");
      } catch {
        return [];
      }
      if (!topLevel || topLevel.length === 0) return [];

      function recurse(currentDir: string, children: string[]): void {
        for (const child of children) {
          const fullPath = currentDir ? `${currentDir}/${child}` : child;
          if (tree.isFile(fullPath)) {
            results.push(fullPath);
          } else {
            let subChildren: string[];
            try {
              subChildren = tree.children(fullPath);
            } catch {
              continue;
            }
            if (subChildren && subChildren.length > 0) {
              recurse(fullPath, subChildren);
            }
          }
        }
      }

      recurse(dir, topLevel);
      return results.sort();
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Helper: read a JSON file from the Tree and parse it.
 * Returns `null` if the file doesn't exist.
 */
export function readJsonFile<T = Record<string, unknown>>(
  tree: Tree,
  path: string,
): T | null {
  const content = tree.read(path, "utf8");
  if (content === null) return null;
  return JSON.parse(content) as T;
}

/**
 * Helper: write a JSON file to the Tree with 2-space indent + trailing newline.
 */
export function writeJsonFile(
  tree: Tree,
  path: string,
  data: unknown,
): void {
  tree.write(path, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Helper: deep-merge a patch into an existing JSON file on the Tree.
 * Creates the file if it doesn't exist.
 */
export function mergeJsonFile(
  tree: Tree,
  path: string,
  patch: Record<string, unknown>,
): void {
  const existing = readJsonFile<Record<string, unknown>>(tree, path);
  const merged = { ...(existing ?? {}), ...patch };
  writeJsonFile(tree, path, merged);
}
