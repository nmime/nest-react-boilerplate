import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { join, relative, resolve } from "node:path";
import { run } from "../../runtime/process";

export interface StaticCheckOptions {
  workspaceRoot?: string;
}

export interface ChangedFormatCheckOptions {
  argv?: string[];
  workspaceRoot?: string;
}

interface CheckFailure {
  command: string;
  file?: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ReferencedScript {
  owner: string;
  script: string;
  reference: string;
  path: string;
}

const nodeScriptReference =
  /(?:^|&&|\|\||;|\s)node\s+([^\s]+\.(?:cjs|js|mjs|mts|ts))/g;
const shellScriptReference = /(?:^|&&|\|\||;|\s)(?:bash|sh)\s+([^\s]+\.sh)/g;
const pnpmRunReference = /(?:^|&&|\|\||;|\s)pnpm\s+run\s+([@\w:.-]+)/g;

interface StaleReferencePattern {
  label: string;
  pattern: RegExp;
}

const staleReferencePatterns: StaleReferencePattern[] = [
  { label: "retired xRocket product reference", pattern: /\bxrocket\b/iu },
  { label: "retired wallet product reference", pattern: /\bwallet\b/iu },
  { label: "retired common exceptions alias", pattern: /@app\/common\/exceptions/u },
  {
    label: "retired common exceptions path",
    pattern: /libs\/backend\/common\/exceptions/u,
  },
  { label: "retired problem wrapper", pattern: /\bApiProblemExceptions\b/u },
  {
    label: "retired problem validation wrapper",
    pattern: /\bClientDataProblemValidationException\b/u,
  },
  { label: "retired problem filter", pattern: /\bProblemExceptionFilter\b/u },
  {
    label: "retired problem transformer",
    pattern: /\bProblemResponseTransformer\b/u,
  },
  { label: "retired problem HTTP exception", pattern: /\bProblemHttpException\b/u },
  {
    label: "retired problem validation pipe helper",
    pattern: /\bcreateProblemValidationPipe\b/u,
  },
  {
    label: "retired problem validation pipe file",
    pattern: /problem-validation\.pipe/u,
  },
  { label: "retired pnpm major", pattern: /\bpnpm@10(?:\.\d+)?\b/u },
  { label: "retired pnpm major", pattern: /\bpnpm\s+10(?:\.\d+)?\b/u },
  {
    label: "unsupported current Node version reference",
    pattern: /\bNode(?:\.js)?\s+(?:20|22|24)\b/u,
  },
  {
    label: "unsupported workflow Node version reference",
    pattern: /\bnode-version:\s*['"]?(?:20|22|24)(?:\.x)?['"]?\b/u,
  },
  {
    label: "unsupported workflow Node version reference",
    pattern: /\bNODE_VERSION\b[^\n]*(?:20|22|24)\b/u,
  },
  { label: "retired Problem Details RFC", pattern: /\bRFC\s?7807\b/iu },
];

const staleReferenceIgnoredDirectories = new Set([
  ".cache",
  ".git",
  ".nx",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "tmp",
]);

const staleReferenceIgnoredFiles = new Set([
  "packages/tooling/src/commands/tooling/static-check.ts",
  "pnpm-lock.yaml",
]);

const staleReferenceExtensions = new Set([
  "",
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);


export function runStaticCheck(options: StaticCheckOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const syntaxTargets = collectToolingModuleScripts(workspaceRoot);
  const smokeCommands = getSmokeCommands();
  const failures = [
    ...checkSyntaxTargets(workspaceRoot, syntaxTargets),
    ...checkToolingTypecheck(workspaceRoot),
    ...checkGeneratorRegressionTests(workspaceRoot),
    ...checkSmokeCommands(workspaceRoot, smokeCommands),
    ...checkFrontendFsd(workspaceRoot),
    ...checkStaleReferences(workspaceRoot),
    ...checkPackageScriptReferences(workspaceRoot).map(toPackageScriptFailure),
  ];

  if (failures.length > 0) {
    reportFailures(failures);
    return 1;
  }

  console.log(
    JSON.stringify({
      status: "ok",
      checkedSyntax: syntaxTargets.length,
      toolingTypecheck: "ok",
      generatorRegressionTests: "ok",
      importSmoke: smokeCommands.length,
      frontendFsdSelfTest: "ok",
      frontendFsdWorkspaceCheck: "ok",
      staleReferenceDenylist: staleReferencePatterns.length,
      packageScriptReferences: countPackageScriptReferences(workspaceRoot),
    }),
  );

  return 0;
}

function checkSyntaxTargets(
  workspaceRoot: string,
  syntaxTargets: string[],
): CheckFailure[] {
  return syntaxTargets.flatMap((script) => {
    const result = run(process.execPath, ["--check", script], {
      cwd: workspaceRoot,
    });

    if (result.status === 0) return [];

    return [
      {
        ...result,
        file: relativeToWorkspace(workspaceRoot, script),
      },
    ];
  });
}

function checkToolingTypecheck(workspaceRoot: string): CheckFailure[] {
  const result = run("pnpm", ["--filter", "@repo/tooling", "typecheck"], {
    cwd: workspaceRoot,
  });

  return result.status === 0 ? [] : [result];
}

function checkGeneratorRegressionTests(workspaceRoot: string): CheckFailure[] {
  const result = run(
    process.execPath,
    ["--test", "packages/tooling/src/commands/project/generate-vertical-slice.test.ts"],
    { cwd: workspaceRoot },
  );

  return result.status === 0 ? [] : [result];
}

function getSmokeCommands(): string[][] {
  return [
    ["packages/tooling/bin/repo-tooling.mjs", "--help"],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "git",
      "branch-cleanup",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "project",
      "check-library-configs",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "tooling",
      "static-check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "tooling",
      "changed-format-check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "frontend",
      "fsd",
      "check",
      "--help",
    ],
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "db",
      "migrations",
      "rollback-check",
      "--help",
    ],
  ];
}

function checkSmokeCommands(
  workspaceRoot: string,
  smokeCommands: string[][],
): CheckFailure[] {
  return smokeCommands.flatMap((args) => {
    const result = run(process.execPath, args, { cwd: workspaceRoot });
    return result.status === 0 ? [] : [result];
  });
}

function checkFrontendFsd(workspaceRoot: string): CheckFailure[] {
  const selfTest = run(
    process.execPath,
    [
      "packages/tooling/bin/repo-tooling.mjs",
      "frontend",
      "fsd",
      "check",
      "--self-test",
    ],
    { cwd: workspaceRoot },
  );
  const workspaceCheck = run(
    process.execPath,
    ["packages/tooling/bin/repo-tooling.mjs", "frontend", "fsd", "check"],
    { cwd: workspaceRoot },
  );

  return [selfTest, workspaceCheck].filter((result) => result.status !== 0);
}

function checkStaleReferences(workspaceRoot: string): CheckFailure[] {
  return collectStaleReferenceTargets(workspaceRoot).flatMap((file) => {
    const relativeFile = relativeToWorkspace(workspaceRoot, file);
    const text = readFileSync(file, "utf8");
    const failures: CheckFailure[] = [];

    text.split(/\r?\n/u).forEach((line, index) => {
      for (const staleReference of staleReferencePatterns) {
        if (!staleReference.pattern.test(line)) continue;

        failures.push({
          command: "stale architecture/version denylist",
          file: `${relativeFile}:${index + 1}`,
          status: 1,
          stdout: "",
          stderr: `Found ${staleReference.label}. Use current product-neutral, exception/swagger, Problem Details RFC9457, Node 26, and pnpm 11.5.2 references.`,
        });
      }
    });

    return failures;
  });
}

function collectStaleReferenceTargets(workspaceRoot: string): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (staleReferenceIgnoredDirectories.has(entry.name)) continue;
        visit(join(directory, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;

      const file = join(directory, entry.name);
      const relativeFile = relativeToWorkspace(workspaceRoot, file);

      if (staleReferenceIgnoredFiles.has(relativeFile)) continue;
      if (file.endsWith(".tsbuildinfo")) continue;
      if (!staleReferenceExtensions.has(extname(file).toLowerCase())) continue;

      files.push(file);
    }
  }

  visit(workspaceRoot);
  return files.sort((left, right) => left.localeCompare(right));
}

function toPackageScriptFailure(failure: ReferencedScript): CheckFailure {
  return {
    command: `package.json script reference ${failure.owner}#${failure.script}`,
    file: failure.owner,
    status: 1,
    stdout: "",
    stderr: `Missing referenced script path: ${failure.reference} -> ${failure.path}`,
  };
}

function reportFailures(failures: CheckFailure[]): void {
  console.error("Tooling static validation failed:");

  for (const failure of failures) {
    console.error(`- command: ${failure.command}`);
    if (failure.file) console.error(`  file: ${failure.file}`);
    console.error(`  exitCode: ${failure.status}`);
    if (failure.stderr) console.error(`  stderr: ${tail(failure.stderr)}`);
    if (failure.stdout) console.error(`  stdout: ${tail(failure.stdout)}`);
    if (failure.error) console.error(`  error: ${failure.error}`);
  }
}

export function runChangedFormatCheck(
  options: ChangedFormatCheckOptions = {},
): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const parsed = parseArgs(options.argv ?? []);
  const base =
    parsed.options.get("base") ?? process.env.FORMAT_BASE_REF ?? "origin/main";
  const head =
    parsed.options.get("head") ?? process.env.FORMAT_HEAD_REF ?? "HEAD";
  const mergeBaseResult = run("git", ["merge-base", base, head], {
    cwd: workspaceRoot,
  });

  if (mergeBaseResult.status !== 0) {
    console.error(`Unable to determine merge-base for ${base} and ${head}.`);
    if (mergeBaseResult.stderr) console.error(tail(mergeBaseResult.stderr));
    return mergeBaseResult.status;
  }

  const mergeBase = mergeBaseResult.stdout.trim();
  const changedResult = run(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...${head}`],
    { cwd: workspaceRoot },
  );

  if (changedResult.status !== 0) {
    console.error("Unable to list changed files for formatting check.");
    if (changedResult.stderr) console.error(tail(changedResult.stderr));
    return changedResult.status;
  }

  const files = changedResult.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .filter(isPrettierCandidate);

  if (files.length === 0) {
    console.log(JSON.stringify({ status: "ok", checkedFiles: 0, base, head }));
    return 0;
  }

  const result = run(
    "pnpm",
    ["exec", "prettier", "--check", "--ignore-unknown", ...files],
    { cwd: workspaceRoot, stdio: "inherit" },
  );

  if (result.status !== 0) return result.status;

  console.log(
    JSON.stringify({ status: "ok", checkedFiles: files.length, base, head }),
  );
  return 0;
}

function collectToolingModuleScripts(workspaceRoot: string): string[] {
  return [
    ...walk(resolve(workspaceRoot, "packages/tooling/bin")),
    ...walk(resolve(workspaceRoot, "scripts")),
  ]
    .filter((path) => path.endsWith(".mjs"))
    .sort((left, right) => left.localeCompare(right));
}

function walk(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...walk(path));
    } else if (stat.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function checkPackageScriptReferences(
  workspaceRoot: string,
): ReferencedScript[] {
  return ["package.json", "packages/tooling/package.json"].flatMap((owner) => {
    const packageJson = readPackageJson(workspaceRoot, owner);
    const scripts = packageJson.scripts ?? {};

    return Object.entries(scripts).flatMap(([script, command]) => [
      ...findMissingPathReferences(workspaceRoot, owner, script, command),
      ...findMissingScriptReferences(owner, scripts, script, command),
    ]);
  });
}

function readPackageJson(
  workspaceRoot: string,
  owner: string,
): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(resolve(workspaceRoot, owner), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

function findMissingPathReferences(
  workspaceRoot: string,
  owner: string,
  script: string,
  command: string,
): ReferencedScript[] {
  return [
    ...extractPathReferences(command, nodeScriptReference),
    ...extractPathReferences(command, shellScriptReference),
  ].flatMap((reference) => {
    const path = normalizeReference(reference);
    const absolutePath = resolve(workspaceRoot, owner, "..", path);

    if (statExists(absolutePath)) return [];

    return [
      {
        owner,
        script,
        reference,
        path: relativeToWorkspace(workspaceRoot, absolutePath),
      },
    ];
  });
}

function findMissingScriptReferences(
  owner: string,
  scripts: Record<string, string>,
  script: string,
  command: string,
): ReferencedScript[] {
  return extractScriptReferences(command).flatMap((referencedScript) => {
    if (Object.hasOwn(scripts, referencedScript)) return [];

    return [
      {
        owner,
        script,
        reference: `pnpm run ${referencedScript}`,
        path: `${owner}#scripts.${referencedScript}`,
      },
    ];
  });
}

function countPackageScriptReferences(workspaceRoot: string): number {
  return ["package.json", "packages/tooling/package.json"].reduce(
    (count, packageJsonPath) => {
      const packageJson = JSON.parse(
        readFileSync(resolve(workspaceRoot, packageJsonPath), "utf8"),
      ) as { scripts?: Record<string, string> };
      return (
        count +
        Object.values(packageJson.scripts ?? {}).reduce(
          (innerCount, command) =>
            innerCount +
            extractPathReferences(command, nodeScriptReference).length +
            extractPathReferences(command, shellScriptReference).length +
            extractScriptReferences(command).length,
          0,
        )
      );
    },
    0,
  );
}

function extractPathReferences(command: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...command.matchAll(pattern)].map((match) => match[1] ?? "");
}

function extractScriptReferences(command: string): string[] {
  pnpmRunReference.lastIndex = 0;
  return [...command.matchAll(pnpmRunReference)].map((match) => match[1] ?? "");
}

function normalizeReference(reference: string): string {
  return reference.replace(/^['"]|['"]$/g, "");
}

function statExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function relativeToWorkspace(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).replaceAll("\\", "/");
}

function isPrettierCandidate(file: string): boolean {
  if (
    /(^|\/)(node_modules|dist|coverage|test-results|playwright-report|\.nx|\.cache|tmp)(\/|$)/u.test(
      file,
    )
  ) {
    return false;
  }
  if (file === "pnpm-lock.yaml" || file.endsWith(".tsbuildinfo")) return false;
  return new Set([
    "",
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".mts",
    ".scss",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
  ]).has(extname(file).toLowerCase());
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

function tail(value: string, max = 2000): string {
  return value.length > max ? value.slice(-max) : value;
}
