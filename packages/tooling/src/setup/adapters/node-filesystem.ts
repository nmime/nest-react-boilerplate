/**
 * Node.js filesystem adapter — atomic writes via temp file + rename.
 *
 * All paths are POSIX-style relative to a configured base directory
 * (typically the workspace root).
 */
import {
  access,
  mkdir,
  readFileSync,
  readdir,
  rename,
  rm,
  writeFileSync,
} from "node:fs";
import { readdir as readdirAsync, writeFile as writeFileAsync, readFile as readFileAsync, unlink, mkdir as mkdirAsync, rename as renameAsync, rm as rmAsync, access as accessAsync } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { FilesystemAdapter } from "./filesystem.js";

// ---------------------------------------------------------------------------

/**
 * Resolve a POSIX relative path to an absolute path on the local filesystem.
 */
function resolvePath(base: string, relative: string): string {
  return join(base, ...relative.split("/").filter(Boolean));
}

// ---------------------------------------------------------------------------

/**
 * Production filesystem adapter backed by Node.js fs APIs.
 * Writes are atomic: content is written to a `.tmp` file in the same
 * directory, then renamed into place.
 */
export function createNodeFilesystem(baseDir: string): FilesystemAdapter {
  return {
    async read(path: string): Promise<string | null> {
      const abs = resolvePath(baseDir, path);
      try {
        await accessAsync(abs);
        return readFileSync(abs, "utf8");
      } catch {
        return null;
      }
    },

    async write(path: string, content: string): Promise<void> {
      const abs = resolvePath(baseDir, path);
      const dir = dirname(abs);
      const tmpPath = abs + ".tmp";

      // Ensure parent directory exists
      await mkdirAsync(dir, { recursive: true });

      // Write to temp file first (atomic replacement)
      await writeFileAsync(tmpPath, content, "utf8");

      // Rename temp → target (atomic on POSIX)
      await renameAsync(tmpPath, abs);
    },

    async delete(path: string): Promise<void> {
      const abs = resolvePath(baseDir, path);
      try {
        await rmAsync(abs, { force: true });
      } catch {
        // Already gone — no-op
      }
    },

    async exists(path: string): Promise<boolean> {
      const abs = resolvePath(baseDir, path);
      try {
        await accessAsync(abs);
        return true;
      } catch {
        return false;
      }
    },

    async list(dir = ""): Promise<string[]> {
      const base = dir ? resolvePath(baseDir, dir) : baseDir;
      const results: string[] = [];
      await recurse(base, dir ? dir : "", results);
      return results.sort();
    },
  };
}

/** Recursively collect file paths. */
async function recurse(absDir: string, relDir: string, out: string[]): Promise<void> {
  const entries = await readdirAsync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    // Skip hidden files and common build artifacts
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const abs = join(absDir, entry.name);
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await recurse(abs, rel, out);
    } else {
      out.push(rel);
    }
  }
}
