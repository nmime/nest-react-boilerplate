import { run } from "../../runtime/process";

interface BranchCleanupOptions {
  argv: string[];
  workspaceRoot: string;
}

interface BranchCandidate {
  name: string;
  scope: "local" | "remote";
  command: string;
  args: string[];
}

const protectedBranchPatterns = [
  /^main$/u,
  /^master$/u,
  /^develop(?:ment)?$/u,
  /^release(?:\/|$)/u,
  /^hotfix(?:\/|$)/u,
  /^prod(?:uction)?$/u,
  /^staging$/u,
  /^origin\/HEAD$/u,
];

export function runBranchCleanup({
  argv,
  workspaceRoot,
}: BranchCleanupOptions): number {
  const parsed = parseArgs(argv);
  const target = parsed.options.get("target") ?? "origin/main";
  const remote = parsed.options.get("remote") ?? "origin";
  const apply = parsed.flags.has("apply");
  const includeRemote = parsed.flags.has("remote");

  const targetCheck = run("git", ["rev-parse", "--verify", target], {
    cwd: workspaceRoot,
  });
  if (targetCheck.status !== 0) {
    console.error(`Branch cleanup target not found: ${target}`);
    if (targetCheck.stderr) console.error(targetCheck.stderr.trim());
    return 1;
  }

  const currentBranch = run("git", ["branch", "--show-current"], {
    cwd: workspaceRoot,
  }).stdout.trim();
  const currentHead = run("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
  }).stdout.trim();
  const candidates = [
    ...collectLocalCandidates(
      workspaceRoot,
      target,
      currentBranch,
      currentHead,
    ),
    ...(includeRemote
      ? collectRemoteCandidates(workspaceRoot, target, remote)
      : []),
  ];

  if (apply) {
    for (const candidate of candidates) {
      const result = run(candidate.command, candidate.args, {
        cwd: workspaceRoot,
      });
      if (result.status !== 0) {
        console.error(
          `Failed to delete ${candidate.scope} branch ${candidate.name}`,
        );
        if (result.stderr) console.error(result.stderr.trim());
        return result.status;
      }
    }
  }

  console.log(
    JSON.stringify({
      status: "ok",
      mode: apply ? "apply" : "check",
      target,
      includeRemote,
      candidates: candidates.map(({ name, scope }) => ({ name, scope })),
    }),
  );
  return 0;
}

function collectLocalCandidates(
  workspaceRoot: string,
  target: string,
  currentBranch: string,
  currentHead: string,
): BranchCandidate[] {
  const result = run(
    "git",
    ["branch", "--merged", target, "--format=%(refname:short)"],
    {
      cwd: workspaceRoot,
    },
  );
  if (result.status !== 0) return [];

  return result.stdout
    .split("\n")
    .map((branch) => branch.trim())
    .filter(Boolean)
    .filter((branch) => branch !== currentBranch && !isProtectedBranch(branch))
    .filter((branch) => branchHead(workspaceRoot, branch) !== currentHead)
    .map((name) => ({
      name,
      scope: "local" as const,
      command: "git",
      args: ["branch", "-d", name],
    }));
}

function collectRemoteCandidates(
  workspaceRoot: string,
  target: string,
  remote: string,
): BranchCandidate[] {
  const result = run(
    "git",
    ["branch", "-r", "--merged", target, "--format=%(refname:short)"],
    {
      cwd: workspaceRoot,
    },
  );
  if (result.status !== 0) return [];

  return result.stdout
    .split("\n")
    .map((branch) => branch.trim())
    .filter(Boolean)
    .filter((branch) => branch.startsWith(`${remote}/`))
    .filter(
      (branch) =>
        !isProtectedBranch(branch) &&
        !isProtectedBranch(branch.slice(remote.length + 1)),
    )
    .map((name) => ({
      name,
      scope: "remote" as const,
      command: "git",
      args: ["push", remote, "--delete", name.slice(remote.length + 1)],
    }));
}

function isProtectedBranch(branch: string): boolean {
  return protectedBranchPatterns.some((pattern) => pattern.test(branch));
}

function branchHead(workspaceRoot: string, branch: string): string {
  return run("git", ["rev-parse", branch], {
    cwd: workspaceRoot,
  }).stdout.trim();
}

function parseArgs(argv: string[]): {
  flags: Set<string>;
  options: Map<string, string>;
} {
  const flags = new Set<string>();
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
    } else {
      flags.add(raw);
    }
  }
  return { flags, options };
}
