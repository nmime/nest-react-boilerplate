import { run } from "../../runtime/process";
import { type GitConventionsConfig, matchesAnyPathPattern } from "./conventions-config";

/**
 * Per-commit buildability rules.
 *
 * Every check here is a pure tree read: `git ls-tree`, `git show <sha>:<path>` and `git grep <sha>`
 * answer "was this commit a valid checkout point?" without an install, a checkout, or a typecheck,
 * which is the only way the gate can afford to run over every commit of a pull request.
 */
export interface AliasImportSite {
  path: string;
  line: number;
  specifier: string;
}

export interface CommitTree {
  hash: string;
  files: readonly string[];
  readFile(path: string): string | null;
  /** Lazy: the alias scan spawns a `git grep`, so an off switch must cost nothing. */
  aliasImports(): readonly AliasImportSite[];
}

interface TreeIndex {
  files: Set<string>;
  directories: Set<string>;
}

export function validateCommitTree(tree: CommitTree, config: GitConventionsConfig): string[] {
  if (!config.tree.enabled) return [];

  const index = createTreeIndex(tree.files);
  const failures: string[] = [];

  if (config.tree.lockfileImporters) failures.push(...checkLockfileImporters(tree, index));
  if (config.tree.tsconfigPathTargets) failures.push(...checkTsconfigPathTargets(tree, index, config));
  if (config.tree.aliasImports) failures.push(...checkAliasImports(tree, index, config));

  return failures;
}

export function readCommitTree(
  workspaceRoot: string,
  hash: string,
  config: GitConventionsConfig,
): CommitTree {
  const listing = git(workspaceRoot, ["ls-tree", "-r", "-z", "--name-only", "--full-tree", hash]);
  const files = listing.split("\0").filter(Boolean);
  const contents = new Map<string, string | null>();
  let aliasSites: AliasImportSite[] | null = null;
  const present = new Set(files);

  return {
    hash,
    files,
    readFile(path) {
      if (!present.has(path)) return null;
      const cached = contents.get(path);
      if (cached !== undefined) return cached;
      const content = git(workspaceRoot, ["show", `${hash}:${path}`]);
      contents.set(path, content);
      return content;
    },
    aliasImports() {
      aliasSites ??= readAliasImports(workspaceRoot, hash, config.tree.aliasPrefix);
      return aliasSites;
    },
  };
}

/**
 * Extract the importer keys of a pnpm lockfile.
 *
 * Hand-parsed rather than loaded through a YAML package: the importers block is a flat list of
 * two-space-indented keys, and the tooling package keeps its runtime dependency surface empty.
 */
export function parseLockfileImporters(lockfile: string): string[] {
  const importers: string[] = [];
  let inside = false;

  for (const line of lockfile.split(/\r?\n/u)) {
    if (!inside) {
      if (line.trimEnd() === "importers:") inside = true;
      continue;
    }
    if (line.trim().length === 0) continue;
    if (!line.startsWith(" ")) break;

    const match = /^ {2}(?! )['"]?([^'":]+)['"]?:\s*$/u.exec(line);
    if (match?.[1]) importers.push(match[1]);
  }

  return importers;
}

export function parseTsconfigPaths(tsconfig: string): Record<string, string[]> {
  return readCompilerOptions(tsconfig).paths;
}

/**
 * Resolve a workspace alias to its tsconfig targets, honouring `/*` wildcards the way TypeScript
 * does: the longest literal prefix wins and the captured tail is substituted into the target.
 */
export function resolveAliasTargets(specifier: string, paths: Record<string, string[]>): string[] | null {
  const exact = paths[specifier];
  if (exact) return exact;

  let best: { prefix: string; targets: string[]; tail: string } | null = null;
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf("*");
    if (star < 0) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (specifier.length < prefix.length + suffix.length) continue;
    if (best && best.prefix.length >= prefix.length) continue;
    best = { prefix, targets, tail: specifier.slice(prefix.length, specifier.length - suffix.length) };
  }

  if (!best) return null;
  const { targets, tail } = best;
  // `split`/`join` rather than `replace` or `replaceAll`: a target may carry more than one `*`, and
  // both replace forms read `$&` in the replacement as a back-reference, which would mangle a tail
  // containing `$`.
  return targets.map((target) => target.split("*").join(tail));
}

function checkLockfileImporters(tree: CommitTree, index: TreeIndex): string[] {
  const lockfile = tree.readFile("pnpm-lock.yaml");
  if (lockfile === null) return [];

  return parseLockfileImporters(lockfile).flatMap((importer) => {
    const manifest = importer === "." ? "package.json" : `${importer}/package.json`;
    if (index.files.has(manifest)) return [];
    return [
      `${tree.hash}: pnpm-lock.yaml declares importer ${importer} but ${manifest} is missing from the tree; pnpm install --frozen-lockfile cannot run at this commit`,
    ];
  });
}

function checkTsconfigPathTargets(
  tree: CommitTree,
  index: TreeIndex,
  config: GitConventionsConfig,
): string[] {
  const tsconfig = tree.readFile("tsconfig.base.json");
  if (tsconfig === null) return [];

  const { paths, baseUrl } = readCompilerOptions(tsconfig);
  const failures: string[] = [];

  for (const [alias, targets] of Object.entries(paths)) {
    for (const target of targets) {
      const resolved = joinBaseUrl(baseUrl, target);
      const exists = resolved.includes("*")
        ? index.directories.has(wildcardDirectory(resolved))
        : existsAsModule(index, resolved, config.tree.resolutionExtensions);
      if (exists) continue;
      failures.push(
        `${tree.hash}: tsconfig.base.json maps ${alias} to ${target}, which is missing from the tree`,
      );
    }
  }

  return failures;
}

function checkAliasImports(tree: CommitTree, index: TreeIndex, config: GitConventionsConfig): string[] {
  const tsconfig = tree.readFile("tsconfig.base.json");
  const { paths, baseUrl } = tsconfig === null ? { paths: {}, baseUrl: "." } : readCompilerOptions(tsconfig);
  const failures: string[] = [];

  for (const site of tree.aliasImports()) {
    if (matchesAnyPathPattern(site.path, config.tree.excludedPaths)) continue;

    const targets = resolveAliasTargets(site.specifier, paths);
    if (targets === null) {
      failures.push(
        `${tree.hash}: ${site.path}:${site.line} imports ${site.specifier}, which no tsconfig.base.json path maps at this commit`,
      );
      continue;
    }
    const resolvable = targets.some((target) =>
      existsAsModule(index, joinBaseUrl(baseUrl, target), config.tree.resolutionExtensions),
    );
    if (resolvable) continue;
    failures.push(
      `${tree.hash}: ${site.path}:${site.line} imports ${site.specifier}, whose target ${targets.join(" or ")} does not exist at this commit`,
    );
  }

  return failures;
}

function readAliasImports(workspaceRoot: string, hash: string, prefix: string): AliasImportSite[] {
  const pattern = `from[[:space:]]+["']${escapeRegExp(prefix)}`;
  const result = run(
    "git",
    // --full-name keeps the reported paths repository-relative regardless of the caller's cwd.
    ["grep", "-n", "-I", "--no-color", "--full-name", "-E", pattern, hash, "--", "*.ts", "*.tsx"],
    { cwd: workspaceRoot },
  );

  // `git grep` exits 1 when nothing matched, which is a normal result, not an error.
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(`git grep over ${hash} failed: ${result.stderr.trim()}`);
  }

  return parseAliasGrepOutput(result.stdout, hash, prefix);
}

export function parseAliasGrepOutput(stdout: string, hash: string, prefix: string): AliasImportSite[] {
  const specifierPattern = new RegExp(`from\\s+["'](${escapeRegExp(prefix)}[^"']+)["']`, "gu");
  const sites: AliasImportSite[] = [];

  for (const raw of stdout.split(/\r?\n/u)) {
    if (!raw.startsWith(`${hash}:`)) continue;
    const record = /^(.*?):(\d+):(.*)$/u.exec(raw.slice(hash.length + 1));
    const path = record?.[1];
    const line = record?.[2];
    const text = record?.[3];
    if (!path || !line || text === undefined) continue;

    for (const match of text.matchAll(specifierPattern)) {
      const specifier = match[1];
      if (specifier) sites.push({ path, line: Number(line), specifier });
    }
  }

  return sites;
}

function createTreeIndex(files: readonly string[]): TreeIndex {
  const index: TreeIndex = { files: new Set(files), directories: new Set() };
  for (const file of files) {
    let cut = file.lastIndexOf("/");
    while (cut > 0) {
      const directory = file.slice(0, cut);
      if (index.directories.has(directory)) break;
      index.directories.add(directory);
      cut = directory.lastIndexOf("/");
    }
  }
  return index;
}

function existsAsModule(index: TreeIndex, target: string, extensions: readonly string[]): boolean {
  if (index.files.has(target)) return true;
  for (const extension of extensions) {
    if (index.files.has(`${target}${extension}`)) return true;
    if (index.files.has(`${target}/index${extension}`)) return true;
  }
  // TS-ESM source imports spell the compiled extension; the file on disk is the TypeScript one.
  const compiled = /\.(?:js|jsx|mjs|cjs)$/u.exec(target);
  if (compiled) {
    const stem = target.slice(0, -compiled[0].length);
    return extensions.some((extension) => index.files.has(`${stem}${extension}`));
  }
  return false;
}

function wildcardDirectory(target: string): string {
  const star = target.indexOf("*");
  const cut = target.lastIndexOf("/", star);
  return cut < 0 ? "" : target.slice(0, cut);
}

function joinBaseUrl(baseUrl: string, target: string): string {
  const base = baseUrl.replace(/^\.\//u, "").replace(/\/$/u, "");
  if (base === "" || base === ".") return target;
  return `${base}/${target}`;
}

function readCompilerOptions(tsconfig: string): { paths: Record<string, string[]>; baseUrl: string } {
  const parsed: unknown = JSON.parse(stripJsonComments(tsconfig));
  const options =
    parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).compilerOptions as Record<string, unknown> | undefined)
      : undefined;
  const rawPaths = options?.paths;
  const paths: Record<string, string[]> = {};

  if (rawPaths && typeof rawPaths === "object") {
    for (const [alias, targets] of Object.entries(rawPaths as Record<string, unknown>)) {
      if (!Array.isArray(targets)) continue;
      paths[alias] = targets.filter((target): target is string => typeof target === "string");
    }
  }

  return { paths, baseUrl: typeof options?.baseUrl === "string" ? options.baseUrl : "." };
}

/** tsconfig files are JSONC; comments and trailing commas are legal there and fatal to JSON.parse. */
function stripJsonComments(text: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let comment: "line" | "block" | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";

    if (comment === "line") {
      if (char === "\n") {
        comment = null;
        output += char;
      }
      continue;
    }
    if (comment === "block") {
      if (char === "*" && next === "/") {
        comment = null;
        index += 1;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      comment = "line";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      comment = "block";
      index += 1;
      continue;
    }
    output += char;
  }

  return output.replace(/,(\s*[}\]])/gu, "$1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function git(workspaceRoot: string, args: string[]): string {
  const result = run("git", args, { cwd: workspaceRoot });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
