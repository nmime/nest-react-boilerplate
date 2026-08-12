import { run } from "../../runtime/process";
import { readCommitTree, validateCommitTree } from "./commit-tree";
import {
  type GitConventionsConfig,
  defaultGitConventionsConfig,
  loadGitConventionsConfig,
  matchesAnyPathPattern,
} from "./conventions-config";

interface GitConventionsOptions {
  argv: string[];
  workspaceRoot: string;
}

export interface CommitFileStat {
  path: string;
  insertions: number;
  deletions: number;
}

export interface CommitStats {
  files: CommitFileStat[];
}

export interface CommitMetadata {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  parents: string[];
  message: string;
  /** ISO-8601 author date; absent when the caller did not read it. */
  authorDate?: string;
  /** ISO-8601 committer date; absent when the caller did not read it. */
  committerDate?: string;
  /** Absent when the caller only read metadata; shape rules then have nothing to measure. */
  stats?: CommitStats;
}

const ownerName = "nmime";
const ownerEmail = "66474195+nmime@users.noreply.github.com";
const branchTypes = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "hotfix",
  "perf",
  "refactor",
  "release",
  "revert",
  "test",
] as const;
const commitTypes = branchTypes.filter(
  (type) => type !== "hotfix" && type !== "release",
);
const protectedBranches = new Set(["main"]);
const forbiddenBranchIdentity = /(?:^|\/)(?:claude|codex)(?:\/|$)/iu;
const branchPattern = new RegExp(
  `^(?:${branchTypes.join("|")})/[a-z0-9]+(?:-[a-z0-9]+)*$`,
  "u",
);
const commitPattern = new RegExp(
  `^(?:${commitTypes.join("|")})(?:\\([a-z0-9][a-z0-9/-]*\\))?!?: [a-z0-9].+$`,
  "u",
);
const agentIdentity = /(?:codex|claude|splox|executor|(?:^|[\s<@._-])(?:ai[-_. ]?)?agent(?:[\s>@._-]|$))/iu;
const attributionTrailer = /^(?:co-authored-by|signed-off-by):\s*(.+)$/gimu;
// Same shape without the global flag: `test()` on a /g regex advances lastIndex between calls.
const attributionTrailerLine = /^\s*(?:co-authored-by|signed-off-by):\s*(.+)$/iu;

export function validateBranchName(branch: string): string[] {
  const failures: string[] = [];

  if (forbiddenBranchIdentity.test(branch)) {
    failures.push(`branch must not contain a codex or claude path segment: ${branch}`);
  }

  if (
    !protectedBranches.has(branch) &&
    !branch.startsWith("dependabot/") &&
    !branchPattern.test(branch)
  ) {
    failures.push(
      `branch must match <type>/<kebab-case>; allowed types: ${branchTypes.join(", ")}`,
    );
  }

  return failures;
}

export function validateCommit(
  commit: CommitMetadata,
  config: GitConventionsConfig = defaultGitConventionsConfig(),
): string[] {
  const failures: string[] = [];
  const subject = commit.message.split("\n", 1)[0] ?? "";

  const ownerAttributed =
    commit.authorName === ownerName &&
    commit.authorEmail === ownerEmail &&
    commit.committerName === ownerName &&
    commit.committerEmail === ownerEmail;
  const agentAttributed =
    isAgentIdentity(commit.authorName, commit.authorEmail) ||
    isAgentIdentity(commit.committerName, commit.committerEmail);

  if (agentAttributed && !ownerAttributed) {
    failures.push(
      `${commit.hash}: agent-produced commits must use author and committer ${ownerName} <${ownerEmail}>`,
    );
  }

  if (commit.parents.length > 1) {
    failures.push(`${commit.hash}: merge commits are not allowed; rebase or squash the branch`);
  }

  if (!commitPattern.test(subject)) {
    failures.push(
      `${commit.hash}: subject must use Conventional Commits; allowed types: ${commitTypes.join(", ")}`,
    );
  }

  if (subject.length > config.body.maxSubjectLength) {
    failures.push(
      `${commit.hash}: subject is ${subject.length} characters (max ${config.body.maxSubjectLength}); move the detail into the body`,
    );
  }

  for (const match of commit.message.matchAll(attributionTrailer)) {
    if (agentIdentity.test(match[1] ?? "")) {
      failures.push(`${commit.hash}: assistant attribution trailers are not allowed`);
    }
  }

  failures.push(...validateCommitIdentity(commit, config));
  failures.push(...validateCommitShape(commit, config));

  return failures;
}

/**
 * Author and committer must be the same person unless something in the commit says why not.
 *
 * A replayed history borrows contributor identities it never collaborated with; a genuine applied
 * patch or pairing session leaves a trailer, and forge automation is allowlisted by identity.
 */
function validateCommitIdentity(commit: CommitMetadata, config: GitConventionsConfig): string[] {
  if (!config.identity.enforceAuthorCommitterMatch) return [];

  const author = `${commit.authorName} <${commit.authorEmail}>`;
  const committer = `${commit.committerName} <${commit.committerEmail}>`;
  // The email is the account; a differing display name is a local `user.name`, which is exactly
  // what .mailmap normalises, so comparing the rendered identity would fail honest commits.
  if (commit.authorEmail.toLowerCase() === commit.committerEmail.toLowerCase()) return [];

  const allowlisted = [commit.authorName, commit.authorEmail, commit.committerName, commit.committerEmail].some(
    (identity) => matchesAnyPathPattern(identity, config.identity.allowedDivergentIdentities),
  );
  if (allowlisted) return [];

  const explained =
    config.identity.coAuthorTrailerExplainsDivergence &&
    commit.message.split("\n").some((line) => attributionTrailerLine.test(line));
  if (!explained) {
    return [
      `${commit.hash}: author ${author} differs from committer ${committer}; add a Co-authored-by trailer or allowlist the identity`,
    ];
  }

  if (
    config.identity.flagIdenticalDatesOnDivergence &&
    commit.authorDate !== undefined &&
    commit.authorDate === commit.committerDate
  ) {
    return [
      `${commit.hash}: author and committer dates are identical on a commit whose author is not the committer`,
    ];
  }

  return [];
}

/**
 * Rules that need the diff, not just the message.
 *
 * Generated output is measured separately from hand-written source: a regenerated client is
 * hundreds of thousands of lines nobody reviews line by line, so counting it would either force
 * an escape hatch on every legitimate regeneration or set the caps so high they stop meaning
 * anything.
 */
function validateCommitShape(commit: CommitMetadata, config: GitConventionsConfig): string[] {
  if (!commit.stats) return [];

  const failures: string[] = [];
  const source = commit.stats.files.filter(
    (file) => !matchesAnyPathPattern(file.path, config.generated.patterns),
  );
  const generated = commit.stats.files.length - source.length;
  const changedFiles = source.length;
  const insertions = source.reduce((total, file) => total + file.insertions, 0);

  if (
    config.generated.requireSourceChange &&
    generated > 0 &&
    changedFiles === 0 &&
    !commit.message.includes(config.generated.regenerateMarker)
  ) {
    failures.push(
      `${commit.hash}: commit ships ${generated} generated files without any source change; commit the producer with its output or mark it ${config.generated.regenerateMarker}`,
    );
  }

  if (!commit.message.includes(config.size.bulkMarker)) {
    if (changedFiles > config.size.maxFilesChanged) {
      failures.push(
        `${commit.hash}: commit changes ${changedFiles} files (max ${config.size.maxFilesChanged}); split it or mark it ${config.size.bulkMarker}`,
      );
    }
    if (insertions > config.size.maxInsertions) {
      failures.push(
        `${commit.hash}: commit adds ${insertions} insertions (max ${config.size.maxInsertions}); split it or mark it ${config.size.bulkMarker}`,
      );
    }
  }

  const needsBody =
    changedFiles > config.body.requiredAboveFilesChanged ||
    insertions > config.body.requiredAboveInsertions;
  if (needsBody && !hasBody(commit.message)) {
    failures.push(
      `${commit.hash}: a commit of ${changedFiles} files / ${insertions} insertions must explain itself in a body`,
    );
  }

  return failures;
}

/** Attribution trailers are bookkeeping, not an explanation, so they do not count as a body. */
function hasBody(message: string): boolean {
  const [, ...rest] = message.split("\n");
  return rest.some((line) => line.trim().length > 0 && !attributionTrailerLine.test(line));
}

function isAgentIdentity(name: string, email: string): boolean {
  return agentIdentity.test(`${name} <${email}>`);
}

export function runGitConventions({
  argv,
  workspaceRoot,
}: GitConventionsOptions): number {
  const options = parseArgs(argv);
  const branch =
    options.get("branch") ??
    process.env.GITHUB_HEAD_REF ??
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ??
    gitOutput(workspaceRoot, ["branch", "--show-current"]);
  const range = options.get("range") ?? defaultRange(workspaceRoot, branch);
  const config = loadGitConventionsConfig(workspaceRoot);
  const failures = validateBranchName(branch);
  const commits = readCommits(workspaceRoot, range);

  for (const commit of commits) {
    failures.push(...validateCommit(commit, config));
    if (!config.tree.enabled || commit.parents.length > 1) continue;
    failures.push(...validateCommitTree(readCommitTree(workspaceRoot, commit.hash, config), config));
  }

  console.log(
    JSON.stringify(
      {
        status: failures.length === 0 ? "ok" : "error",
        branch,
        range,
        commitCount: commits.length,
        failures,
      },
      null,
      2,
    ),
  );
  return failures.length === 0 ? 0 : 1;
}

function defaultRange(workspaceRoot: string, branch: string): string {
  if (protectedBranches.has(branch)) return "HEAD..HEAD";

  const baseCheck = run("git", ["rev-parse", "--verify", "origin/main"], {
    cwd: workspaceRoot,
  });
  if (baseCheck.status !== 0) return "HEAD..HEAD";

  const mergeBase = gitOutput(workspaceRoot, ["merge-base", "origin/main", "HEAD"]);
  return `${mergeBase}..HEAD`;
}

function readCommits(workspaceRoot: string, range: string): CommitMetadata[] {
  const normalizedRange = normalizeRange(range, (commit) => {
    return run("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: workspaceRoot,
    }).status === 0;
  });
  const result = run(
    "git",
    [
      "log",
      "--date=iso-strict",
      "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%ad%x1f%cd%x1f%P%x1f%B%x1e",
      normalizedRange,
    ],
    { cwd: workspaceRoot },
  );

  if (result.status !== 0) {
    throw new Error(`Unable to inspect commit range ${range}: ${result.stderr.trim()}`);
  }

  const stats = readCommitStats(workspaceRoot, normalizedRange);

  return result.stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        hash = "",
        authorName = "",
        authorEmail = "",
        committerName = "",
        committerEmail = "",
        authorDate = "",
        committerDate = "",
        parentList = "",
        message = "",
      ] = record.split("\x1f");

      return {
        hash,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        authorDate,
        committerDate,
        parents: parentList.split(" ").filter(Boolean),
        message: message.trim(),
        stats: stats.get(hash) ?? { files: [] },
      };
    });
}

/**
 * Read the per-file diff of the whole range in one process.
 *
 * `--no-renames` keeps every row a plain path: rename detection collapses a pair into a
 * `{old => new}` spelling that no path pattern can classify.
 */
function readCommitStats(workspaceRoot: string, range: string): Map<string, CommitStats> {
  const result = run(
    "git",
    ["log", "--format=%x1e%H", "--numstat", "--no-renames", range],
    { cwd: workspaceRoot },
  );

  if (result.status !== 0) {
    throw new Error(`Unable to measure commit range ${range}: ${result.stderr.trim()}`);
  }

  const stats = new Map<string, CommitStats>();
  for (const record of result.stdout.split("\x1e")) {
    const [header = "", ...rows] = record.split("\n");
    const hash = header.trim();
    if (!hash) continue;

    const files: CommitFileStat[] = [];
    for (const row of rows) {
      const columns = row.split("\t");
      const path = columns[2]?.trim();
      if (!path || columns.length < 3) continue;
      files.push({
        path,
        // Binary rows report "-"; they add no reviewable lines but still count as a file.
        insertions: Number.parseInt(columns[0] ?? "", 10) || 0,
        deletions: Number.parseInt(columns[1] ?? "", 10) || 0,
      });
    }
    stats.set(hash, { files });
  }

  return stats;
}

export function normalizeRange(
  range: string,
  commitExists: (commit: string) => boolean,
): string {
  const pushRange = /^([0-9a-f]{40})\.\./u.exec(range);
  if (!pushRange) return range;

  const before = pushRange[1] ?? "";
  return before === "0".repeat(40) || !commitExists(before) ? "HEAD" : range;
}

function gitOutput(workspaceRoot: string, args: string[]): string {
  const result = run("git", args, { cwd: workspaceRoot });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function parseArgs(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? "";
    if (!value.startsWith("--")) continue;
    const raw = value.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      options.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(raw, next);
      index += 1;
    }
  }
  return options;
}
