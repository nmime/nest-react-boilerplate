/**
 * Path utility: compute the number of `../` segments needed to reach
 * workspace root from a given directory path.
 *
 *   depth("libs/backend/common/response/lib") => 5  (five segments, five ../ to root)
 */
function depth(dir: string): number {
  return dir.split("/").length;
}

/**
 * Build a relative prefix of `../` repeated `depth(dir)` times.
 *
 *   dots("libs/backend/common/response/lib") => "../../../../../"
 */
function dots(dir: string): string {
  return "../".repeat(depth(dir));
}

/**
 * Build a relative prefix for going UP from `dir` to the given base
 * (e.g., "coverage", "node_modules", "config") at the workspace root.
 *
 *   toBase("libs/backend/common/response/lib", "config") => "../../../../../config"
 */
function toBase(dir: string, base: string): string {
  return `${dots(dir)}${base}`;
}
