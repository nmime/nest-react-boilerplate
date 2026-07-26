import { realpathSync, statSync } from "node:fs";
import path from "node:path";

export function isPathInsideRoot(rootDir: string, candidate: string): boolean {
  return candidate === rootDir || candidate.startsWith(`${rootDir}${path.sep}`);
}

export function resolveWorkspaceSubdirectory(
  workspaceRoot: string,
  value: string,
  allowedRelativeRoot: string,
  optionName: string,
): string {
  const allowedRoot = path.resolve(workspaceRoot, allowedRelativeRoot);
  const candidate = path.resolve(workspaceRoot, value);

  if (!isPathInsideRoot(allowedRoot, candidate)) {
    throw new Error(`${optionName} must resolve inside ${allowedRelativeRoot}`);
  }

  return candidate;
}

export function resolveExistingStaticFile(rootDir: string, urlPath: string): string {
  const canonicalRoot = realpathSync(rootDir);
  const fallback = realpathSync(path.join(canonicalRoot, "index.html"));

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return fallback;
  }

  const requested = path.resolve(canonicalRoot, `.${decodedPath}`);
  if (!isPathInsideRoot(canonicalRoot, requested)) {
    return fallback;
  }

  try {
    const candidate = realpathSync(requested);
    if (!isPathInsideRoot(canonicalRoot, candidate) || !statSync(candidate).isFile()) {
      return fallback;
    }
    return candidate;
  } catch {
    return fallback;
  }
}
