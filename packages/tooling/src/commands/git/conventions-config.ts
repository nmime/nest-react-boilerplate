import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tunables for `nrb git:conventions`.
 *
 * Every threshold lives here so a downstream product can retune the gate from its own
 * `nrb.config.json` (`gitConventions` key) instead of forking boilerplate-owned tooling source.
 */
export interface CommitSizeConfig {
  /** Maximum non-generated files a single commit may touch. */
  maxFilesChanged: number;
  /** Maximum non-generated inserted lines a single commit may add. */
  maxInsertions: number;
  /** Subject/body marker that opts a deliberate sweeping change out of the size caps. */
  bulkMarker: string;
}

export interface CommitBodyConfig {
  /** A commit touching more than this many non-generated files must explain itself. */
  requiredAboveFilesChanged: number;
  /** A commit inserting more than this many non-generated lines must explain itself. */
  requiredAboveInsertions: number;
  /** Hard cap on the subject line so `git log --oneline` stays readable. */
  maxSubjectLength: number;
}

export interface CommitIdentityConfig {
  /** When false, author/committer divergence is never reported. */
  enforceAuthorCommitterMatch: boolean;
  /** Identities (name or email, glob-matched) exempt from the divergence rule, e.g. forge bots. */
  allowedDivergentIdentities: string[];
  /** When true, a Co-authored-by/Signed-off-by trailer documents the divergence. */
  coAuthorTrailerExplainsDivergence: boolean;
  /**
   * Opt-in: a real cherry-pick or applied patch moves the committer date, so identical dates on a
   * divergent identity indicate a scripted replay. `git commit --author=…` produces the same shape
   * legitimately, which is why this stays off by default.
   */
  flagIdenticalDatesOnDivergence: boolean;
}

export interface GeneratedPathsConfig {
  /** Glob patterns whose lines are machine output: excluded from the size caps. */
  patterns: string[];
  /** When true, a commit may not ship generated output without the source that produced it. */
  requireSourceChange: boolean;
  /** Marker that opts a deliberate regeneration-only commit out of `requireSourceChange`. */
  regenerateMarker: string;
}

export interface TreeChecksConfig {
  /** Master switch for the per-commit tree reads. */
  enabled: boolean;
  /** Every `pnpm-lock.yaml` importer must have a `package.json` in the same tree. */
  lockfileImporters: boolean;
  /** Every `tsconfig.base.json` path target must exist in the same tree. */
  tsconfigPathTargets: boolean;
  /** Every `from '<prefix>…'` specifier must resolve to a file in the same tree. */
  aliasImports: boolean;
  /** Workspace alias prefix scanned by the alias rule. */
  aliasPrefix: string;
  /** Glob patterns excluded from the alias scan (string fixtures, not real imports). */
  excludedPaths: string[];
  /** Extension candidates tried when an alias target has no extension of its own. */
  resolutionExtensions: string[];
}

export interface GitConventionsConfig {
  size: CommitSizeConfig;
  body: CommitBodyConfig;
  identity: CommitIdentityConfig;
  generated: GeneratedPathsConfig;
  tree: TreeChecksConfig;
}

export function defaultGitConventionsConfig(): GitConventionsConfig {
  return {
    size: {
      maxFilesChanged: 100,
      maxInsertions: 2000,
      bulkMarker: "[bulk]",
    },
    body: {
      requiredAboveFilesChanged: 20,
      requiredAboveInsertions: 400,
      maxSubjectLength: 80,
    },
    identity: {
      enforceAuthorCommitterMatch: true,
      // Forge automation commits as itself and lets the forge sign the commit, so the pair always
      // diverges without a trailer to explain it.
      allowedDivergentIdentities: ["*[bot]*", "noreply@github.com", "noreply@gitlab.com"],
      coAuthorTrailerExplainsDivergence: true,
      flagIdenticalDatesOnDivergence: false,
    },
    generated: {
      patterns: [
        "pnpm-lock.yaml",
        "**/pnpm-lock.yaml",
        ".nrb/**",
        "**/generated/**",
        "**/*.generated.*",
        "**/__snapshots__/**",
        "**/*.snap",
        "**/baselines/**",
        "**/contracts/openapi/*.json",
        "CHANGELOG.md",
      ],
      requireSourceChange: true,
      regenerateMarker: "[regenerate]",
    },
    tree: {
      enabled: true,
      lockfileImporters: true,
      tsconfigPathTargets: true,
      aliasImports: true,
      aliasPrefix: "@app/",
      // packages/tooling stores alias spellings as string fixtures for its own checks; they are
      // data, not imports, and resolving them would report phantom breakage.
      excludedPaths: ["packages/tooling/**"],
      resolutionExtensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json", ".css", ".svg"],
    },
  };
}

/**
 * Merge a product override onto the defaults.
 *
 * Unknown keys and wrong value types throw: a silently ignored typo in `nrb.config.json` would
 * leave the gate running defaults while the product believes it retuned them.
 */
export function resolveGitConventionsConfig(raw: unknown): GitConventionsConfig {
  const config = defaultGitConventionsConfig();
  if (raw === undefined || raw === null) return config;

  const groups = asRecord(raw, "gitConventions");
  for (const [group, overrides] of Object.entries(groups)) {
    if (!isConfigGroup(config, group)) {
      throw new Error(`Unknown key gitConventions.${group}; expected one of ${Object.keys(config).join(", ")}`);
    }
    mergeGroup(config[group] as unknown as Record<string, unknown>, overrides, `gitConventions.${group}`);
  }

  return config;
}

/**
 * Read the `gitConventions` key of the workspace `nrb.config.json`.
 *
 * The file is read as raw JSON rather than through `parseNrbConfig`, so the gate keeps working on
 * a workspace whose selection config is mid-edit; only its own key is interpreted.
 */
export function loadGitConventionsConfig(workspaceRoot: string): GitConventionsConfig {
  const configPath = join(workspaceRoot, "nrb.config.json");
  if (!existsSync(configPath)) return defaultGitConventionsConfig();

  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    return resolveGitConventionsConfig(record.gitConventions);
  } catch (error) {
    throw new Error(`${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Match a repository-relative path against a glob supporting `**`, `*`, and `?`.
 *
 * Kept local rather than pulled from a matcher package: the gate runs per commit in CI and the
 * tooling package deliberately has no runtime dependency on a glob library.
 */
export function matchesPathPattern(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

export function matchesAnyPathPattern(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPathPattern(path, pattern));
}

const globCache = new Map<string, RegExp>();

function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;

  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    if (char === "*" && pattern[index + 1] === "*") {
      const hasSlash = pattern[index + 2] === "/";
      source += hasSlash ? "(?:[^/]+/)*" : "[^]*";
      index += hasSlash ? 2 : 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  }

  const expression = new RegExp(`^${source}$`, "u");
  globCache.set(pattern, expression);
  return expression;
}

function isConfigGroup(config: GitConventionsConfig, key: string): key is keyof GitConventionsConfig {
  return Object.hasOwn(config, key);
}

function mergeGroup(target: Record<string, unknown>, overrides: unknown, label: string): void {
  const record = asRecord(overrides, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`${label} must set at least one key; remove it to keep the defaults`);
  }

  for (const [key, value] of Object.entries(record)) {
    const current = target[key];
    if (current === undefined) {
      throw new Error(`Unknown key ${label}.${key}; expected one of ${Object.keys(target).join(", ")}`);
    }
    target[key] = coerce(current, value, `${label}.${key}`);
  }
}

function coerce(current: unknown, value: unknown, label: string): unknown {
  if (typeof current === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative number`);
    }
    return value;
  }
  if (typeof current === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
    return value;
  }
  if (typeof current === "string") {
    if (typeof value !== "string") throw new Error(`${label} must be a string`);
    return value;
  }
  if (Array.isArray(current)) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(`${label} must be an array of strings`);
    }
    return value;
  }
  throw new Error(`${label} is not overridable`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
