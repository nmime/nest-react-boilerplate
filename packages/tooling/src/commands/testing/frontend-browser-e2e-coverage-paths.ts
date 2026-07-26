import { readdirSync, realpathSync } from "node:fs";
import path from "node:path";

export interface StaticFileIndex {
  fallback: string;
  files: ReadonlyMap<string, string>;
}

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

export function buildStaticFileIndex(rootDir: string): StaticFileIndex {
  const canonicalRoot = realpathSync(rootDir);
  const fallback = realpathSync(path.join(canonicalRoot, "index.html"));
  if (!isPathInsideRoot(canonicalRoot, fallback)) {
    throw new Error("Static index must resolve inside the configured distribution directory");
  }

  const files = new Map<string, string>([["/", fallback]]);

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(candidate);
        continue;
      }
      if (!entry.isFile()) continue;
      const requestPath = `/${path
        .relative(canonicalRoot, candidate)
        .split(path.sep)
        .join("/")}`;
      files.set(requestPath, candidate);
    }
  }

  visit(canonicalRoot);
  return { fallback, files };
}

export function resolveExistingStaticFile(index: StaticFileIndex, urlPath: string): string {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return index.fallback;
  }

  if (!decodedPath.startsWith("/")) return index.fallback;
  return index.files.get(decodedPath) ?? index.fallback;
}
